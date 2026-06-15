import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { jobEvents, videoRenditions, videos } from '$lib/server/db/schema';

type WebhookPayload = {
	id?: string;
	status?: string;
	output?: {
		appVideoId?: string;
		masterPlaylistKey?: string;
		renditions?: Array<{
			label: string;
			height: number;
			width?: number | null;
			videoBitrate: string;
			audioBitrate: string;
			playlistKey: string;
			segmentPrefix: string;
		}>;
		probe?: {
			width?: number | null;
			height?: number | null;
			durationSeconds?: number | null;
		};
	};
	error?: string;
};

export async function recordJobEvent(
	videoId: string | null,
	type: string,
	runpodJobId: string | null,
	payload: unknown
) {
	await db.insert(jobEvents).values({
		videoId,
		type,
		runpodJobId,
		payload: JSON.stringify(payload)
	});
}

export async function applyRunpodWebhook(payload: WebhookPayload) {
	const output = payload.output;
	const videoId = output?.appVideoId;
	const runpodJobId = payload.id ?? null;

	const matches = videoId
		? await db.select().from(videos).where(eq(videos.id, videoId)).limit(1)
		: runpodJobId
			? await db.select().from(videos).where(eq(videos.runpodJobId, runpodJobId)).limit(1)
			: [];
	const video = matches[0];

	if (!video) {
		await recordJobEvent(null, 'orphan_webhook', runpodJobId, payload);
		throw new Error('Webhook did not match a known video');
	}

	await recordJobEvent(video.id, `runpod_${payload.status || 'unknown'}`, runpodJobId, payload);

	if (payload.status === 'COMPLETED' && output?.masterPlaylistKey) {
		await db
			.update(videos)
			.set({
				status: 'ready',
				masterPlaylistKey: output.masterPlaylistKey,
				errorMessage: null,
				sourceWidth: output.probe?.width ?? null,
				sourceHeight: output.probe?.height ?? null,
				durationSeconds: output.probe?.durationSeconds ?? null,
				updatedAt: Date.now()
			})
			.where(eq(videos.id, video.id));

		for (const rendition of output.renditions || []) {
			await db
				.update(videoRenditions)
				.set({
					width: rendition.width ?? null,
					height: rendition.height,
					videoBitrate: rendition.videoBitrate,
					audioBitrate: rendition.audioBitrate,
					playlistKey: rendition.playlistKey,
					segmentPrefix: rendition.segmentPrefix,
					status: 'ready',
					updatedAt: Date.now()
				})
				.where(
					and(eq(videoRenditions.videoId, video.id), eq(videoRenditions.label, rendition.label))
				);
		}

		return { videoId: video.id, status: 'ready' };
	}

	if (
		payload.status === 'FAILED' ||
		payload.status === 'TIMED_OUT' ||
		payload.status === 'CANCELLED'
	) {
		await db
			.update(videos)
			.set({
				status: 'error',
				errorMessage: payload.error || `RunPod job ${payload.status.toLowerCase()}`,
				updatedAt: Date.now()
			})
			.where(eq(videos.id, video.id));
		return { videoId: video.id, status: 'error' };
	}

	await db
		.update(videos)
		.set({
			status:
				payload.status === 'IN_PROGRESS' || payload.status === 'RUNNING'
					? 'processing'
					: video.status,
			updatedAt: Date.now()
		})
		.where(eq(videos.id, video.id));

	return { videoId: video.id, status: payload.status || video.status };
}
