# Deployment

This repo publishes both deployable images from one version tag.

## Publish Images

Create and push a semantic version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Publish Images` GitHub Actions workflow builds `linux/amd64` images and pushes:

```text
ghcr.io/hinkolas/serverless-transcoding-demo-worker:v0.1.0
ghcr.io/hinkolas/serverless-transcoding-demo-web:v0.1.0
```

Each image is also tagged with the commit SHA.

You can also run the workflow manually from GitHub Actions with a `version` input such as `v0.1.0`.

## RunPod Worker

Use the worker image as the RunPod Serverless queue endpoint container image:

```text
ghcr.io/hinkolas/serverless-transcoding-demo-worker:v0.1.0
```

Configure the RunPod endpoint environment with:

```text
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

The app sends bucket, region, endpoint URL, source key, output prefix, and rendition settings in each job.

## Web App

The web image is:

```text
ghcr.io/hinkolas/serverless-transcoding-demo-web:v0.1.0
```

Runtime environment variables are the same as `web/.env.example`.

## Coolify Web Deployment

Use the root `docker-compose.yml` to deploy the web app through Coolify. The Compose file builds
the web container from the checked-out repository commit, so a Coolify redeploy of `main` runs the
current web code instead of a previously published GHCR tag.

The Compose file runs a Postgres service with a persistent `postgres_data` volume and sets:

```text
DATABASE_URL=postgres://postgres:postgres@postgres:5432/video_transcoding
```

Configure these variables in Coolify:

```text
POSTGRES_DB=video_transcoding
POSTGRES_USER=postgres
POSTGRES_PASSWORD=...
S3_ENDPOINT=https://fsn1.your-objectstorage.com
S3_REGION=fsn1
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
RUNPOD_MODE=real
RUNPOD_API_KEY=...
RUNPOD_ENDPOINT_ID=...
APP_BASE_URL=https://your-domain.example
WEBHOOK_SECRET=...
```

Optional:

```text
SIGNED_URL_TTL_SECONDS=300
RUNPOD_EXECUTION_TIMEOUT_MS=7200000
RUNPOD_TTL_MS=86400000
```
