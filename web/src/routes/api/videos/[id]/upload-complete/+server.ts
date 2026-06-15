import { eq } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { jobEvents, videos } from '$lib/server/db/schema';
import {
	buildMockRunpodOutput,
	isMockRunpodMode,
	submitRunpodJob
} from '$lib/server/services/runpod';
import { applyRunpodWebhook, recordJobEvent } from '$lib/server/services/video-jobs';

export const POST: RequestHandler = async ({ params }) => {
	const id = params.id;
	if (!id) return json({ message: 'Video id is required' }, { status: 400 });

	const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
	if (!video) return json({ message: 'Video not found' }, { status: 404 });

	await db
		.update(videos)
		.set({
			status: 'queued',
			updatedAt: Date.now()
		})
		.where(eq(videos.id, video.id));

	await db.insert(jobEvents).values({
		videoId: video.id,
		type: 'upload_complete',
		payload: JSON.stringify({ sourceKey: video.sourceKey })
	});

	try {
		const [queuedVideo] = await db.select().from(videos).where(eq(videos.id, video.id)).limit(1);
		const result = await submitRunpodJob(queuedVideo);

		await db
			.update(videos)
			.set({
				runpodJobId: result.id,
				status: result.mock ? 'processing' : 'queued',
				updatedAt: Date.now()
			})
			.where(eq(videos.id, video.id));

		await recordJobEvent(video.id, 'runpod_submitted', result.id, result);

		if (isMockRunpodMode()) {
			await applyRunpodWebhook({
				id: result.id,
				status: 'COMPLETED',
				output: buildMockRunpodOutput(queuedVideo)
			});
		}

		return json({ job: result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to submit RunPod job';
		await db
			.update(videos)
			.set({
				status: 'error',
				errorMessage: message,
				updatedAt: Date.now()
			})
			.where(eq(videos.id, video.id));
		await recordJobEvent(video.id, 'runpod_submit_failed', null, { message });
		return json({ message }, { status: 500 });
	}
};
