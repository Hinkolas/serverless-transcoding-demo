import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const videos = sqliteTable('videos', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	originalFileName: text('original_file_name').notNull(),
	mimeType: text('mime_type').notNull(),
	sizeBytes: integer('size_bytes').notNull(),
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
	sourceWidth: integer('source_width'),
	sourceHeight: integer('source_height'),
	durationSeconds: real('duration_seconds'),
	createdAt: integer('created_at').notNull().$defaultFn(Date.now),
	updatedAt: integer('updated_at').notNull().$defaultFn(Date.now)
});

export const videoRenditions = sqliteTable('video_renditions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	videoId: text('video_id')
		.notNull()
		.references(() => videos.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	width: integer('width'),
	height: integer('height').notNull(),
	videoBitrate: text('video_bitrate').notNull(),
	audioBitrate: text('audio_bitrate').notNull(),
	playlistKey: text('playlist_key'),
	segmentPrefix: text('segment_prefix'),
	status: text('status', {
		enum: ['planned', 'ready', 'error']
	})
		.notNull()
		.default('planned'),
	createdAt: integer('created_at').notNull().$defaultFn(Date.now),
	updatedAt: integer('updated_at').notNull().$defaultFn(Date.now)
});

export const jobEvents = sqliteTable('job_events', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	videoId: text('video_id').references(() => videos.id, { onDelete: 'cascade' }),
	type: text('type').notNull(),
	runpodJobId: text('runpod_job_id'),
	payload: text('payload').notNull(),
	createdAt: integer('created_at').notNull().$defaultFn(Date.now)
});

export type VideoStatus = typeof videos.$inferSelect.status;
