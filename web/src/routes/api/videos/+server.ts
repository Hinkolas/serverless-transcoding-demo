import { desc, eq } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';
import { transcodePresets } from '$lib/server/config/transcoding';
import { db } from '$lib/server/db';
import { jobEvents, videoRenditions, videos } from '$lib/server/db/schema';
import { createPresignedUploadUrl, safeObjectName } from '$lib/server/services/storage';

async function serializeVideos() {
	const rows = await db.select().from(videos).orderBy(desc(videos.createdAt));
	const renditionRows = await db.select().from(videoRenditions);
	const eventRows = await db.select().from(jobEvents).orderBy(desc(jobEvents.createdAt));

	return rows.map((video) => ({
		...video,
		renditions: renditionRows.filter((rendition) => rendition.videoId === video.id),
		events: eventRows
			.filter((event) => event.videoId === video.id)
			.slice(0, 8)
			.map((event) => ({
				...event,
				payload: event.payload
			}))
	}));
}

export const GET: RequestHandler = async () => {
	return json({ videos: await serializeVideos() });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as {
			fileName?: string;
			mimeType?: string;
			sizeBytes?: number;
			title?: string;
		};

		if (!body.fileName || !body.mimeType || !body.sizeBytes) {
			return json({ message: 'fileName, mimeType, and sizeBytes are required' }, { status: 400 });
		}

		if (!body.mimeType.startsWith('video/')) {
			return json({ message: 'Only video uploads are supported' }, { status: 400 });
		}

		const id = crypto.randomUUID();
		const fileName = safeObjectName(body.fileName) || 'source-video';
		const title = body.title?.trim() || body.fileName;
		const sourceKey = `uploads/${id}/${fileName}`;
		const outputPrefix = `outputs/${id}`;
		const uploadUrl = await createPresignedUploadUrl(sourceKey, body.mimeType);

		await db.insert(videos).values({
			id,
			title,
			originalFileName: body.fileName,
			mimeType: body.mimeType,
			sizeBytes: body.sizeBytes,
			sourceKey,
			outputPrefix,
			status: 'uploading'
		});

		await db.insert(videoRenditions).values(
			transcodePresets.map((preset) => ({
				videoId: id,
				label: preset.label,
				height: preset.height,
				videoBitrate: preset.videoBitrate,
				audioBitrate: preset.audioBitrate,
				status: 'planned' as const
			}))
		);

		await db.insert(jobEvents).values({
			videoId: id,
			type: 'upload_url_created',
			payload: JSON.stringify({ sourceKey, outputPrefix })
		});

		const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);

		return json({
			video,
			uploadUrl
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to create upload';
		console.error('Failed to create video upload', error);
		return json({ message }, { status: 500 });
	}
};
