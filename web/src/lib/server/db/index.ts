import { building } from '$app/environment';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const pool = new pg.Pool({
	connectionString: env.DATABASE_URL
});

async function ensureSchema() {
	await pool.query(`
CREATE TABLE IF NOT EXISTS videos (
	id text PRIMARY KEY NOT NULL,
	title text NOT NULL,
	original_file_name text NOT NULL,
	mime_type text NOT NULL,
	size_bytes bigint NOT NULL,
	source_key text NOT NULL,
	output_prefix text NOT NULL,
	master_playlist_key text,
	runpod_job_id text,
	status text DEFAULT 'uploading' NOT NULL,
	error_message text,
	source_width bigint,
	source_height bigint,
	duration_seconds double precision,
	created_at bigint NOT NULL,
	updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS video_renditions (
	id text PRIMARY KEY NOT NULL,
	video_id text NOT NULL REFERENCES videos(id) ON DELETE cascade,
	label text NOT NULL,
	width bigint,
	height bigint NOT NULL,
	video_bitrate text NOT NULL,
	audio_bitrate text NOT NULL,
	playlist_key text,
	segment_prefix text,
	status text DEFAULT 'planned' NOT NULL,
	created_at bigint NOT NULL,
	updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS job_events (
	id text PRIMARY KEY NOT NULL,
	video_id text REFERENCES videos(id) ON DELETE cascade,
	type text NOT NULL,
	runpod_job_id text,
	payload text NOT NULL,
	created_at bigint NOT NULL
);
`);
}

if (!building) {
	await ensureSchema();
}

export const db = drizzle(pool, { schema });
