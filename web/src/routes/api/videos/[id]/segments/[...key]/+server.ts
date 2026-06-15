import { eq } from 'drizzle-orm';
import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { videos } from '$lib/server/db/schema';
import { createPresignedDownloadUrl } from '$lib/server/services/storage';

export const GET: RequestHandler = async ({ params }) => {
	const id = params.id;
	const key = params.key;
	if (!id || !key) throw error(400, 'Video id and segment key are required');

	const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
	if (!video || !key.startsWith(video.outputPrefix)) throw error(404, 'Segment not found');

	const signedUrl = await createPresignedDownloadUrl(key);
	throw redirect(302, signedUrl);
};
