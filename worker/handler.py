import json
import mimetypes
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import boto3
import runpod
from botocore.config import Config
from pydantic import BaseModel, Field, ValidationError, field_validator


class Rendition(BaseModel):
    label: str
    height: int = Field(gt=0)
    width: int | None = Field(default=None, gt=0)
    videoBitrate: str
    maxrate: str
    bufsize: str
    codec: str = "h264"
    audioBitrate: str = "128k"

    @field_validator("codec")
    @classmethod
    def supported_codec(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"h264"}:
            raise ValueError("Only h264 is supported by this worker")
        return normalized


class TranscodeInput(BaseModel):
    appVideoId: str
    sourceKey: str
    outputPrefix: str
    bucket: str
    endpointUrl: str
    region: str = "auto"
    allowUpscale: bool = False
    segmentSeconds: int = Field(default=6, ge=2, le=20)
    renditions: list[Rendition] = Field(min_length=1)


def run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(command)}\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
    return result


def progress(job: dict[str, Any], message: str) -> None:
    try:
        runpod.serverless.progress_update(job, message)
    except Exception:
        print(message, flush=True)


def create_s3_client(endpoint_url: str, region: str):
    access_key = os.getenv("S3_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
    secret_key = os.getenv("S3_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
    if not access_key or not secret_key:
        raise RuntimeError("S3 credentials are missing")

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )


def probe_video(path: Path) -> dict[str, Any]:
    result = run_command(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ]
    )
    data = json.loads(result.stdout)
    video_stream = next(
        (stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"),
        None,
    )
    if not video_stream:
        raise RuntimeError("Source object does not contain a video stream")

    return {
        "width": int(video_stream.get("width") or 0),
        "height": int(video_stream.get("height") or 0),
        "durationSeconds": float(
            video_stream.get("duration")
            or data.get("format", {}).get("duration")
            or 0
        ),
        "codec": video_stream.get("codec_name"),
        "format": data.get("format", {}).get("format_name"),
        "bitrate": int(data.get("format", {}).get("bit_rate") or 0),
    }


def has_encoder(name: str) -> bool:
    try:
        result = run_command(["ffmpeg", "-hide_banner", "-encoders"])
    except Exception:
        return False
    return name in result.stdout


def bitrate_to_int(value: str) -> int:
    normalized = value.strip().lower()
    if normalized.endswith("k"):
        return int(float(normalized[:-1]) * 1000)
    if normalized.endswith("m"):
        return int(float(normalized[:-1]) * 1000 * 1000)
    return int(float(normalized))


def calculated_width(source_width: int, source_height: int, target_height: int) -> int | None:
    if not source_width or not source_height:
        return None
    scaled = round((source_width / source_height) * target_height)
    return scaled if scaled % 2 == 0 else scaled + 1


def ffmpeg_encoder_args(encoder: str) -> list[str]:
    if encoder == "h264_nvenc":
        return ["-c:v", "h264_nvenc", "-preset", "p4", "-profile:v", "main"]
    return ["-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main"]


def transcode_rendition(
    source: Path,
    output_dir: Path,
    rendition: Rendition,
    segment_seconds: int,
    encoder: str,
) -> dict[str, Any]:
    variant_dir = output_dir / rendition.label
    variant_dir.mkdir(parents=True, exist_ok=True)
    playlist_path = variant_dir / "index.m3u8"
    segment_pattern = variant_dir / "segment_%05d.ts"
    scale_filter = f"scale=-2:{rendition.height}"

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-vf",
        scale_filter,
        *ffmpeg_encoder_args(encoder),
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        rendition.videoBitrate,
        "-maxrate",
        rendition.maxrate,
        "-bufsize",
        rendition.bufsize,
        "-force_key_frames",
        f"expr:gte(t,n_forced*{segment_seconds})",
        "-sc_threshold",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        rendition.audioBitrate,
        "-ac",
        "2",
        "-ar",
        "48000",
        "-f",
        "hls",
        "-hls_time",
        str(segment_seconds),
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        str(segment_pattern),
        str(playlist_path),
    ]
    run_command(command)

    return {
        "label": rendition.label,
        "height": rendition.height,
        "width": rendition.width,
        "videoBitrate": rendition.videoBitrate,
        "audioBitrate": rendition.audioBitrate,
        "bandwidth": bitrate_to_int(rendition.videoBitrate)
        + bitrate_to_int(rendition.audioBitrate),
        "playlistFile": f"{rendition.label}/index.m3u8",
        "segmentPrefix": rendition.label,
    }


def write_master_playlist(output_dir: Path, variants: list[dict[str, Any]]) -> None:
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    for variant in variants:
        resolution = ""
        if variant.get("width"):
            resolution = f',RESOLUTION={variant["width"]}x{variant["height"]}'
        lines.append(
            f'#EXT-X-STREAM-INF:BANDWIDTH={variant["bandwidth"]}{resolution}'
        )
        lines.append(variant["playlistFile"])
    (output_dir / "master.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")


def upload_directory(s3, bucket: str, output_prefix: str, directory: Path) -> list[str]:
    uploaded: list[str] = []
    for file_path in directory.rglob("*"):
        if not file_path.is_file():
            continue
        relative_path = file_path.relative_to(directory).as_posix()
        key = f"{output_prefix.rstrip('/')}/{relative_path}"
        content_type = mimetypes.guess_type(file_path.name)[0]
        if file_path.suffix == ".m3u8":
            content_type = "application/vnd.apple.mpegurl"
        elif file_path.suffix == ".ts":
            content_type = "video/mp2t"
        extra_args = {"ContentType": content_type} if content_type else {}
        s3.upload_file(str(file_path), bucket, key, ExtraArgs=extra_args)
        uploaded.append(key)
    return uploaded


def handle_transcode(job: dict[str, Any]) -> dict[str, Any]:
    started_at = time.time()
    try:
        payload = TranscodeInput.model_validate(job.get("input") or {})
    except ValidationError as error:
        raise ValueError(error.json()) from error

    s3 = create_s3_client(payload.endpointUrl, payload.region)
    encoder = "h264_nvenc" if has_encoder("h264_nvenc") else "libx264"

    with tempfile.TemporaryDirectory(prefix="runpod-hls-") as tmp:
        temp_dir = Path(tmp)
        source_path = temp_dir / "source"
        output_dir = temp_dir / "hls"
        output_dir.mkdir()

        progress(job, "Downloading source video")
        s3.download_file(payload.bucket, payload.sourceKey, str(source_path))

        progress(job, "Probing source video")
        probe = probe_video(source_path)
        source_height = int(probe["height"])
        selected = [
            rendition
            for rendition in payload.renditions
            if payload.allowUpscale or rendition.height <= source_height
        ]
        if not selected:
            selected = [min(payload.renditions, key=lambda item: item.height)]

        variants: list[dict[str, Any]] = []
        for rendition in selected:
            progress(job, f"Transcoding {rendition.label}")
            variant = transcode_rendition(
                source_path,
                output_dir,
                rendition,
                payload.segmentSeconds,
                encoder,
            )
            variant["width"] = rendition.width or calculated_width(
                int(probe["width"]), int(probe["height"]), rendition.height
            )
            variants.append(variant)

        write_master_playlist(output_dir, variants)

        progress(job, "Uploading HLS output")
        uploaded_keys = upload_directory(
            s3, payload.bucket, payload.outputPrefix, output_dir
        )

        master_key = f"{payload.outputPrefix.rstrip('/')}/master.m3u8"
        rendition_outputs = [
            {
                **variant,
                "playlistKey": f"{payload.outputPrefix.rstrip('/')}/{variant['playlistFile']}",
                "segmentPrefix": f"{payload.outputPrefix.rstrip('/')}/{variant['segmentPrefix']}",
            }
            for variant in variants
        ]

    return {
        "appVideoId": payload.appVideoId,
        "sourceKey": payload.sourceKey,
        "outputPrefix": payload.outputPrefix,
        "masterPlaylistKey": master_key,
        "renditions": rendition_outputs,
        "probe": probe,
        "uploadedObjectCount": len(uploaded_keys),
        "encoder": encoder,
        "durationMs": int((time.time() - started_at) * 1000),
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    return handle_transcode(job)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--test_input":
        with open(sys.argv[2], "r", encoding="utf-8") as file:
            test_job = json.load(file)
        print(json.dumps(handler(test_job), indent=2))
    else:
        runpod.serverless.start({"handler": handler})
