import path from 'node:path/posix';
import { eq } from 'drizzle-orm';
import { error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { videos } from '$lib/server/db/schema';
import { getObjectText } from '$lib/server/services/storage';

function resolveKey(baseKey: string, line: string) {
	if (line.startsWith('/')) return line.slice(1);
	if (line.includes('://')) return line;
	return path.normalize(path.join(path.dirname(baseKey), line));
}

function segmentUrl(videoId: string, key: string) {
	return `/api/videos/${videoId}/segments/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function playlistUrl(videoId: string, key: string) {
	return `/api/videos/${videoId}/playlist?key=${encodeURIComponent(key)}`;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const id = params.id;
	if (!id) throw error(400, 'Video id is required');

	const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
	if (!video) throw error(404, 'Video not found');
	if (video.status !== 'ready' || !video.masterPlaylistKey) throw error(409, 'Video is not ready');

	const requestedKey = url.searchParams.get('key') || video.masterPlaylistKey;
	if (!requestedKey.startsWith(video.outputPrefix))
		throw error(403, 'Playlist key is outside video output');

	const playlist = await getObjectText(requestedKey);
	const rewritten = playlist
		.split('\n')
		.map((line) => {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) return line;
			const resolved = resolveKey(requestedKey, trimmed);
			if (!resolved.startsWith(video.outputPrefix)) return line;
			if (resolved.endsWith('.m3u8')) return playlistUrl(id, resolved);
			return segmentUrl(id, resolved);
		})
		.join('\n');

	return new Response(rewritten, {
		headers: {
			'content-type': 'application/vnd.apple.mpegurl',
			'cache-control': 'private, max-age=30'
		}
	});
};
