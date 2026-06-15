import { bigint, doublePrecision, pgTable, text } from 'drizzle-orm/pg-core';

export const videos = pgTable('videos', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	originalFileName: text('original_file_name').notNull(),
	mimeType: text('mime_type').notNull(),
	sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
	sourceKey: text('source_key').notNull(),
	outputPrefix: text('output_prefix').notNull(),
	masterPlaylistKey: text('master_playlist_key'),
	runpodJobId: text('runpod_job_id'),
	status: text('status', {
		enum: ['uploading', 'queued', 'processing', 'ready', 'error']
	})
		.notNull()
		.default('uploading'),
	errorMessage: text('error_message'),
	sourceWidth: bigint('source_width', { mode: 'number' }),
	sourceHeight: bigint('source_height', { mode: 'number' }),
	durationSeconds: doublePrecision('duration_seconds'),
	createdAt: bigint('created_at', { mode: 'number' }).notNull().$defaultFn(Date.now),
	updatedAt: bigint('updated_at', { mode: 'number' }).notNull().$defaultFn(Date.now)
});

export const videoRenditions = pgTable('video_renditions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	videoId: text('video_id')
		.notNull()
		.references(() => videos.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	width: bigint('width', { mode: 'number' }),
	height: bigint('height', { mode: 'number' }).notNull(),
	videoBitrate: text('video_bitrate').notNull(),
	audioBitrate: text('audio_bitrate').notNull(),
	playlistKey: text('playlist_key'),
	segmentPrefix: text('segment_prefix'),
	status: text('status', {
		enum: ['planned', 'ready', 'error']
	})
		.notNull()
		.default('planned'),
	createdAt: bigint('created_at', { mode: 'number' }).notNull().$defaultFn(Date.now),
	updatedAt: bigint('updated_at', { mode: 'number' }).notNull().$defaultFn(Date.now)
});

export const jobEvents = pgTable('job_events', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	videoId: text('video_id').references(() => videos.id, { onDelete: 'cascade' }),
	type: text('type').notNull(),
	runpodJobId: text('runpod_job_id'),
	payload: text('payload').notNull(),
	createdAt: bigint('created_at', { mode: 'number' }).notNull().$defaultFn(Date.now)
});

export type VideoStatus = typeof videos.$inferSelect.status;
