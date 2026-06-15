import { env } from '$env/dynamic/private';
import { segmentSeconds, transcodePresets } from '$lib/server/config/transcoding';
import { getStorageConfig } from '$lib/server/services/storage';
import type { videos } from '$lib/server/db/schema';

type Video = typeof videos.$inferSelect;

export type RunpodSubmitResult = {
	id: string;
	status: string;
	mock: boolean;
};

function requireRunpodEnv(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

export function isMockRunpodMode() {
	return (env.RUNPOD_MODE || 'mock') === 'mock';
}

export function buildTranscodeInput(video: Video) {
	const storage = getStorageConfig();

	return {
		appVideoId: video.id,
		sourceKey: video.sourceKey,
		outputPrefix: video.outputPrefix,
		bucket: storage.bucket,
		endpointUrl: storage.endpoint,
		region: storage.region,
		allowUpscale: false,
		segmentSeconds,
		renditions: transcodePresets
	};
}

export async function submitRunpodJob(video: Video): Promise<RunpodSubmitResult> {
	if (isMockRunpodMode()) {
		return {
			id: `mock-${crypto.randomUUID()}`,
			status: 'IN_QUEUE',
			mock: true
		};
	}

	const endpointId = requireRunpodEnv('RUNPOD_ENDPOINT_ID');
	const apiKey = requireRunpodEnv('RUNPOD_API_KEY');
	const appBaseUrl = requireRunpodEnv('APP_BASE_URL').replace(/\/$/, '');
	const webhookSecret = requireRunpodEnv('WEBHOOK_SECRET');
	const executionTimeout = Number(env.RUNPOD_EXECUTION_TIMEOUT_MS || 7_200_000);
	const ttl = Number(env.RUNPOD_TTL_MS || 86_400_000);

	const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${apiKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			input: buildTranscodeInput(video),
			webhook: `${appBaseUrl}/api/runpod/webhook?token=${encodeURIComponent(webhookSecret)}`,
			policy: {
				executionTimeout,
				ttl
			}
		})
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`RunPod submit failed (${response.status}): ${body}`);
	}

	const data = (await response.json()) as { id?: string; status?: string };
	if (!data.id) throw new Error('RunPod did not return a job id');

	return {
		id: data.id,
		status: data.status || 'IN_QUEUE',
		mock: false
	};
}

export function buildMockRunpodOutput(video: Video) {
	return {
		appVideoId: video.id,
		sourceKey: video.sourceKey,
		outputPrefix: video.outputPrefix,
		masterPlaylistKey: `${video.outputPrefix}/master.m3u8`,
		renditions: transcodePresets.map((preset) => ({
			label: preset.label,
			height: preset.height,
			width: null,
			videoBitrate: preset.videoBitrate,
			audioBitrate: preset.audioBitrate,
			playlistKey: `${video.outputPrefix}/${preset.label}/index.m3u8`,
			segmentPrefix: `${video.outputPrefix}/${preset.label}`,
			bandwidth: 0
		})),
		probe: {
			width: null,
			height: null,
			durationSeconds: null,
			codec: 'mock',
			format: 'mock',
			bitrate: 0
		},
		uploadedObjectCount: 0,
		encoder: 'mock',
		durationMs: 0
	};
}
