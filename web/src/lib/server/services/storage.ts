import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

function requireEnv(name: string): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

export function getStorageConfig() {
	return {
		bucket: requireEnv('S3_BUCKET'),
		endpoint: requireEnv('S3_ENDPOINT'),
		region: requireEnv('S3_REGION'),
		accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
		secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY')
	};
}

export function createStorageClient() {
	const config = getStorageConfig();

	return new S3Client({
		endpoint: config.endpoint,
		region: config.region,
		forcePathStyle: false,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey
		}
	});
}

export async function createPresignedUploadUrl(key: string, contentType: string) {
	const config = getStorageConfig();
	const client = createStorageClient();
	const command = new PutObjectCommand({
		Bucket: config.bucket,
		Key: key,
		ContentType: contentType
	});

	return getSignedUrl(client, command, { expiresIn: 15 * 60 });
}

export async function createPresignedDownloadUrl(key: string) {
	const config = getStorageConfig();
	const client = createStorageClient();
	const ttl = Number(env.SIGNED_URL_TTL_SECONDS || 300);
	const command = new GetObjectCommand({
		Bucket: config.bucket,
		Key: key
	});

	return getSignedUrl(client, command, { expiresIn: ttl });
}

export async function getObjectText(key: string) {
	const config = getStorageConfig();
	const client = createStorageClient();
	const result = await client.send(
		new GetObjectCommand({
			Bucket: config.bucket,
			Key: key
		})
	);

	if (!result.Body) throw new Error(`Object ${key} did not have a response body`);
	return result.Body.transformToString();
}

export function safeObjectName(fileName: string) {
	return fileName
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 160);
}
