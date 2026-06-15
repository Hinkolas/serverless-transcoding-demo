import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

if (env.DATABASE_URL !== ':memory:') {
	mkdirSync(dirname(env.DATABASE_URL), { recursive: true });
}

const client = new Database(env.DATABASE_URL);
client.pragma('foreign_keys = ON');

client.exec(`
CREATE TABLE IF NOT EXISTS videos (
	id text PRIMARY KEY NOT NULL,
	title text NOT NULL,
	original_file_name text NOT NULL,
	mime_type text NOT NULL,
	size_bytes integer NOT NULL,
	source_key text NOT NULL,
	output_prefix text NOT NULL,
	master_playlist_key text,
	runpod_job_id text,
	status text DEFAULT 'uploading' NOT NULL,
	error_message text,
	source_width integer,
	source_height integer,
	duration_seconds real,
	created_at integer NOT NULL,
	updated_at integer NOT NULL
);

CREATE TABLE IF NOT EXISTS video_renditions (
	id text PRIMARY KEY NOT NULL,
	video_id text NOT NULL,
	label text NOT NULL,
	width integer,
	height integer NOT NULL,
	video_bitrate text NOT NULL,
	audio_bitrate text NOT NULL,
	playlist_key text,
	segment_prefix text,
	status text DEFAULT 'planned' NOT NULL,
	created_at integer NOT NULL,
	updated_at integer NOT NULL,
	FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS job_events (
	id text PRIMARY KEY NOT NULL,
	video_id text,
	type text NOT NULL,
	runpod_job_id text,
	payload text NOT NULL,
	created_at integer NOT NULL,
	FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE cascade
);
`);

export const db = drizzle(client, { schema });
