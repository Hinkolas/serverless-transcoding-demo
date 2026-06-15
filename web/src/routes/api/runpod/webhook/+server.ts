import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';
import { applyRunpodWebhook } from '$lib/server/services/video-jobs';

export const POST: RequestHandler = async ({ request, url }) => {
	const expectedToken = env.WEBHOOK_SECRET;
	if (!expectedToken || url.searchParams.get('token') !== expectedToken) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	const payload = await request.json();
	try {
		const result = await applyRunpodWebhook(payload);
		return json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Webhook failed';
		return json({ message }, { status: 400 });
	}
};
