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
