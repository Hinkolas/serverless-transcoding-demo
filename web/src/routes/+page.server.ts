import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { jobEvents, videoRenditions, videos } from '$lib/server/db/schema';
import { transcodePresets } from '$lib/server/config/transcoding';
import { env } from '$env/dynamic/private';

export async function load() {
	const videoRows = await db.select().from(videos).orderBy(desc(videos.createdAt));
	const renditionRows = await db.select().from(videoRenditions);
	const eventRows = await db.select().from(jobEvents).orderBy(desc(jobEvents.createdAt));

	return {
		runpodMode: env.RUNPOD_MODE || 'mock',
		presets: transcodePresets,
		videos: videoRows.map((video) => ({
			...video,
			renditions: renditionRows.filter((rendition) => rendition.videoId === video.id),
			events: eventRows.filter((event) => event.videoId === video.id).slice(0, 8)
		}))
	};
}
