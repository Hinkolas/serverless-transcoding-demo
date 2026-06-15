<script lang="ts">
	import { onDestroy } from 'svelte';

	type Rendition = {
		id: string;
		label: string;
		height: number;
		videoBitrate: string;
		audioBitrate: string;
		status: 'planned' | 'ready' | 'error';
		playlistKey: string | null;
	};

	type JobEvent = {
		id: string;
		type: string;
		runpodJobId: string | null;
		payload: string;
		createdAt: number;
	};

	type Video = {
		id: string;
		title: string;
		originalFileName: string;
		mimeType: string;
		sizeBytes: number;
		status: 'uploading' | 'queued' | 'processing' | 'ready' | 'error';
		errorMessage: string | null;
		runpodJobId: string | null;
		sourceWidth: number | null;
		sourceHeight: number | null;
		durationSeconds: number | null;
		createdAt: number;
		updatedAt: number;
		renditions: Rendition[];
		events: JobEvent[];
	};

	let { data } = $props<{
		data: {
			runpodMode: string;
			presets: Array<{
				label: string;
				height: number;
				videoBitrate: string;
				audioBitrate: string;
			}>;
			videos: Video[];
		};
	}>();

	let videos = $state<Video[]>([]);
	let selectedVideoId = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);
	let videoElement = $state<HTMLVideoElement | null>(null);
	let isUploading = $state(false);
	let uploadProgress = $state('');
	let uploadError = $state('');
	let hlsInstance: { destroy: () => void } | null = null;

	const selectedVideo = $derived(videos.find((video) => video.id === selectedVideoId) ?? videos[0]);
	const readyVideos = $derived(videos.filter((video) => video.status === 'ready').length);
	const activeJobs = $derived(
		videos.filter((video) => video.status === 'queued' || video.status === 'processing').length
	);

	onDestroy(() => {
		hlsInstance?.destroy();
	});

	$effect(() => {
		if (videos.length === 0 && data.videos.length > 0) {
			videos = data.videos;
			selectedVideoId = data.videos[0]?.id ?? '';
		}
	});

	function formatBytes(bytes: number) {
		const units = ['B', 'KB', 'MB', 'GB'];
		let value = bytes;
		let unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit += 1;
		}
		return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
	}

	function formatDate(value: number) {
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function formatDuration(seconds: number | null) {
		if (!seconds) return 'Unknown';
		const minutes = Math.floor(seconds / 60);
		const rest = Math.round(seconds % 60)
			.toString()
			.padStart(2, '0');
		return `${minutes}:${rest}`;
	}

	async function refreshVideos() {
		const response = await fetch('/api/videos');
		if (!response.ok) throw new Error('Could not refresh videos');
		const body = (await response.json()) as { videos: Video[] };
		videos = body.videos;
		if (!selectedVideoId && videos[0]) selectedVideoId = videos[0].id;
	}

	async function uploadVideo() {
		uploadError = '';
		const file = fileInput?.files?.[0];
		if (!file) {
			uploadError = 'Choose a video file first.';
			return;
		}

		isUploading = true;
		try {
			uploadProgress = 'Creating upload';
			const createResponse = await fetch('/api/videos', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					fileName: file.name,
					mimeType: file.type || 'video/mp4',
					sizeBytes: file.size,
					title: file.name.replace(/\.[^.]+$/, '')
				})
			});
			const createBody = await createResponse.json();
			if (!createResponse.ok) throw new Error(createBody.message || 'Could not create upload');

			selectedVideoId = createBody.video.id;
			uploadProgress = 'Uploading to Hetzner';
			const uploadResponse = await fetch(createBody.uploadUrl, {
				method: 'PUT',
				headers: { 'content-type': file.type || 'video/mp4' },
				body: file
			});
			if (!uploadResponse.ok) throw new Error('Upload to object storage failed');

			uploadProgress = 'Queueing transcode';
			const completeResponse = await fetch(`/api/videos/${createBody.video.id}/upload-complete`, {
				method: 'POST'
			});
			const completeBody = await completeResponse.json();
			if (!completeResponse.ok)
				throw new Error(completeBody.message || 'Could not queue transcode');

			uploadProgress = 'Queued';
			await refreshVideos();
			if (fileInput) fileInput.value = '';
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Upload failed';
		} finally {
			isUploading = false;
			setTimeout(() => {
				if (!isUploading) uploadProgress = '';
			}, 1500);
		}
	}

	async function playSelected() {
		if (!selectedVideo || selectedVideo.status !== 'ready' || !videoElement) return;
		const source = `/api/videos/${selectedVideo.id}/playlist`;
		hlsInstance?.destroy();
		hlsInstance = null;

		if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
			videoElement.src = source;
			await videoElement.play();
			return;
		}

		const { default: Hls } = await import('hls.js');
		if (Hls.isSupported()) {
			const hls = new Hls();
			hls.loadSource(source);
			hls.attachMedia(videoElement);
			hlsInstance = hls;
		}
	}

	function selectVideo(id: string) {
		selectedVideoId = id;
		queueMicrotask(() => {
			void playSelected();
		});
	}
</script>

<svelte:head>
	<title>Video Transcoding Console</title>
</svelte:head>

<main class="min-h-screen bg-slate-950 text-slate-100">
	<section class="border-b border-slate-800 bg-slate-950/95">
		<div
			class="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 lg:flex-row lg:items-end lg:justify-between"
		>
			<div>
				<p class="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
					RunPod HLS pipeline
				</p>
				<h1 class="mt-2 text-3xl font-semibold tracking-tight text-white">Video library</h1>
			</div>

			<div class="grid grid-cols-3 gap-3 text-sm">
				<div class="rounded border border-slate-800 bg-slate-900 px-4 py-3">
					<p class="text-slate-400">Mode</p>
					<p class="mt-1 font-semibold uppercase text-cyan-200">{data.runpodMode}</p>
				</div>
				<div class="rounded border border-slate-800 bg-slate-900 px-4 py-3">
					<p class="text-slate-400">Ready</p>
					<p class="mt-1 font-semibold">{readyVideos}</p>
				</div>
				<div class="rounded border border-slate-800 bg-slate-900 px-4 py-3">
					<p class="text-slate-400">Active</p>
					<p class="mt-1 font-semibold">{activeJobs}</p>
				</div>
			</div>
		</div>
	</section>

	<div class="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[360px_1fr]">
		<aside class="space-y-5">
			<section class="rounded border border-slate-800 bg-slate-900">
				<div class="border-b border-slate-800 px-4 py-3">
					<h2 class="text-base font-semibold">Upload</h2>
				</div>
				<div class="space-y-4 p-4">
					<input
						bind:this={fileInput}
						accept="video/*"
						type="file"
						class="block w-full rounded border border-slate-700 bg-slate-950 text-sm text-slate-200 file:mr-4 file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
					/>
					<button
						type="button"
						class="w-full rounded bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
						disabled={isUploading}
						onclick={uploadVideo}
					>
						{isUploading ? uploadProgress || 'Working' : 'Upload and transcode'}
					</button>
					{#if uploadError}
						<p class="rounded border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200">
							{uploadError}
						</p>
					{/if}
				</div>
			</section>

			<section class="rounded border border-slate-800 bg-slate-900">
				<div class="border-b border-slate-800 px-4 py-3">
					<h2 class="text-base font-semibold">Configured renditions</h2>
				</div>
				<div class="divide-y divide-slate-800">
					{#each data.presets as preset (preset.label)}
						<div class="flex items-center justify-between px-4 py-3 text-sm">
							<div>
								<p class="font-medium">{preset.label}</p>
								<p class="text-slate-400">H.264 / AAC</p>
							</div>
							<p class="text-slate-300">{preset.videoBitrate}</p>
						</div>
					{/each}
				</div>
			</section>
		</aside>

		<section class="grid min-w-0 gap-5 xl:grid-cols-[1fr_360px]">
			<div class="min-w-0 space-y-5">
				<section class="rounded border border-slate-800 bg-slate-900">
					<div class="flex items-center justify-between border-b border-slate-800 px-4 py-3">
						<h2 class="text-base font-semibold">Library</h2>
						<button
							class="text-sm text-cyan-200 hover:text-cyan-100"
							type="button"
							onclick={refreshVideos}
						>
							Refresh
						</button>
					</div>

					{#if videos.length === 0}
						<div class="px-4 py-10 text-center text-sm text-slate-400">
							No videos yet. Upload an MP4, MOV, or WebM to start a transcode job.
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full min-w-[760px] text-left text-sm">
								<thead class="text-slate-400">
									<tr class="border-b border-slate-800">
										<th class="px-4 py-3 font-medium">Title</th>
										<th class="px-4 py-3 font-medium">Status</th>
										<th class="px-4 py-3 font-medium">Source</th>
										<th class="px-4 py-3 font-medium">Renditions</th>
										<th class="px-4 py-3 font-medium">Created</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-slate-800">
									{#each videos as video (video.id)}
										<tr
											class={`cursor-pointer hover:bg-slate-800/70 ${selectedVideo?.id === video.id ? 'bg-slate-800' : ''}`}
											onclick={() => selectVideo(video.id)}
										>
											<td class="px-4 py-3">
												<p class="max-w-[240px] truncate font-medium text-white">{video.title}</p>
												<p class="max-w-[240px] truncate text-xs text-slate-400">
													{video.originalFileName}
												</p>
											</td>
											<td class="px-4 py-3">
												<span class={`status status-${video.status}`}>{video.status}</span>
											</td>
											<td class="px-4 py-3 text-slate-300">
												{#if video.sourceHeight}
													{video.sourceWidth}x{video.sourceHeight}
												{:else}
													{formatBytes(video.sizeBytes)}
												{/if}
											</td>
											<td class="px-4 py-3 text-slate-300">
												{video.renditions.filter((rendition) => rendition.status === 'ready')
													.length}/{video.renditions.length}
											</td>
											<td class="px-4 py-3 text-slate-400">{formatDate(video.createdAt)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>

				<section class="rounded border border-slate-800 bg-slate-900">
					<div class="border-b border-slate-800 px-4 py-3">
						<h2 class="text-base font-semibold">Player</h2>
					</div>
					<div class="p-4">
						<div class="aspect-video overflow-hidden rounded border border-slate-800 bg-black">
							<video bind:this={videoElement} controls class="h-full w-full"></video>
						</div>
						<div class="mt-3 flex items-center justify-between text-sm text-slate-400">
							<p>{selectedVideo?.title || 'Select a ready video'}</p>
							<button
								class="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:border-cyan-300 disabled:cursor-not-allowed disabled:text-slate-500"
								type="button"
								disabled={!selectedVideo || selectedVideo.status !== 'ready'}
								onclick={playSelected}
							>
								Load HLS
							</button>
						</div>
					</div>
				</section>
			</div>

			<aside class="space-y-5">
				<section class="rounded border border-slate-800 bg-slate-900">
					<div class="border-b border-slate-800 px-4 py-3">
						<h2 class="text-base font-semibold">Details</h2>
					</div>
					{#if selectedVideo}
						<div class="space-y-4 p-4 text-sm">
							<div>
								<p class="text-slate-400">Job</p>
								<p class="mt-1 break-all font-mono text-xs text-slate-200">
									{selectedVideo.runpodJobId || 'Not submitted'}
								</p>
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div>
									<p class="text-slate-400">Duration</p>
									<p class="mt-1">{formatDuration(selectedVideo.durationSeconds)}</p>
								</div>
								<div>
									<p class="text-slate-400">Updated</p>
									<p class="mt-1">{formatDate(selectedVideo.updatedAt)}</p>
								</div>
							</div>
							{#if selectedVideo.errorMessage}
								<p class="rounded border border-red-900 bg-red-950 px-3 py-2 text-red-200">
									{selectedVideo.errorMessage}
								</p>
							{/if}
						</div>
					{:else}
						<p class="p-4 text-sm text-slate-400">No video selected.</p>
					{/if}
				</section>

				<section class="rounded border border-slate-800 bg-slate-900">
					<div class="border-b border-slate-800 px-4 py-3">
						<h2 class="text-base font-semibold">Renditions</h2>
					</div>
					<div class="divide-y divide-slate-800">
						{#each selectedVideo?.renditions || [] as rendition (rendition.id)}
							<div class="flex items-center justify-between px-4 py-3 text-sm">
								<div>
									<p class="font-medium">{rendition.label}</p>
									<p class="text-slate-400">{rendition.height}p · {rendition.audioBitrate}</p>
								</div>
								<span class={`status status-${rendition.status}`}>{rendition.status}</span>
							</div>
						{/each}
					</div>
				</section>

				<section class="rounded border border-slate-800 bg-slate-900">
					<div class="border-b border-slate-800 px-4 py-3">
						<h2 class="text-base font-semibold">Events</h2>
					</div>
					<div class="divide-y divide-slate-800">
						{#each selectedVideo?.events || [] as event (event.id)}
							<div class="px-4 py-3 text-sm">
								<div class="flex items-center justify-between gap-3">
									<p class="font-medium">{event.type}</p>
									<p class="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
								</div>
								{#if event.runpodJobId}
									<p class="mt-1 truncate font-mono text-xs text-slate-500">{event.runpodJobId}</p>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			</aside>
		</section>
	</div>
</main>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		border-radius: 4px;
		border: 1px solid rgb(71 85 105);
		padding: 0.125rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.status-uploading,
	.status-queued,
	.status-planned {
		border-color: rgb(51 65 85);
		background: rgb(15 23 42);
		color: rgb(203 213 225);
	}

	.status-processing {
		border-color: rgb(14 116 144);
		background: rgb(8 47 73);
		color: rgb(165 243 252);
	}

	.status-ready {
		border-color: rgb(22 101 52);
		background: rgb(5 46 22);
		color: rgb(187 247 208);
	}

	.status-error {
		border-color: rgb(127 29 29);
		background: rgb(69 10 10);
		color: rgb(254 202 202);
	}
</style>
