import { createHmac } from 'crypto';
import { LoopsTrigger } from '../../nodes/Loops/LoopsTrigger.node';
import { createMockWebhookFunctions } from './helpers';

function makeSignature(
	secret: string,
	webhookId: string,
	timestamp: string,
	body: string,
): string {
	const secretBytes = Buffer.from(secret, 'base64');
	const signedContent = `${webhookId}.${timestamp}.${body}`;
	const sig = createHmac('sha256', secretBytes).update(signedContent).digest('base64');
	return `v1,${sig}`;
}

describe('LoopsTrigger Node', () => {
	let trigger: LoopsTrigger;

	beforeEach(() => {
		trigger = new LoopsTrigger();
	});

	describe('description', () => {
		it('should have correct metadata', () => {
			expect(trigger.description.name).toBe('loopsTrigger');
			expect(trigger.description.group).toEqual(['trigger']);
			expect(trigger.description.inputs).toEqual([]);
			expect(trigger.description.usableAsTool).toBe(true);
		});

		it('should define 17 webhook event types', () => {
			const eventsProp = trigger.description.properties.find((p) => p.name === 'events');
			expect((eventsProp!.options as unknown[]).length).toBe(17);
		});
	});

	describe('webhookMethods', () => {
		it('should return true for checkExists, create, delete', async () => {
			const hooks = trigger.webhookMethods.default;
			expect(await hooks.checkExists.call({} as never)).toBe(true);
			expect(await hooks.create.call({} as never)).toBe(true);
			expect(await hooks.delete.call({} as never)).toBe(true);
		});
	});

	describe('webhook handler', () => {
		it('should pass through matching events without signature', async () => {
			const body = { eventName: 'contact.created', contactIdentity: { email: 'test@example.com' } };
			const ctx = createMockWebhookFunctions(
				body,
				{},
				{ events: ['contact.created'] },
				{ signingSecret: '' },
			);
			const result = await trigger.webhook.call(ctx);
			expect(result.workflowData).toBeDefined();
			expect(result.workflowData![0][0].json).toEqual(body);
		});

		it('should ignore non-matching events', async () => {
			const body = { eventName: 'email.delivered' };
			const ctx = createMockWebhookFunctions(
				body,
				{},
				{ events: ['contact.created'] },
				{ signingSecret: '' },
			);
			const result = await trigger.webhook.call(ctx);
			expect(result.webhookResponse).toEqual({ status: 200, body: 'Event ignored' });
			expect(result.workflowData).toBeUndefined();
		});

		it('should pass all events when none selected', async () => {
			const body = { eventName: 'email.opened' };
			const ctx = createMockWebhookFunctions(
				body,
				{},
				{ events: [] },
				{ signingSecret: '' },
			);
			const result = await trigger.webhook.call(ctx);
			expect(result.workflowData).toBeDefined();
		});

		it('should reject when signature headers are missing', async () => {
			const ctx = createMockWebhookFunctions(
				{ eventName: 'contact.created' },
				{},
				{ events: ['contact.created'] },
				{ signingSecret: 'dGVzdHNlY3JldA==' },
			);
			const result = await trigger.webhook.call(ctx);
			expect(result.webhookResponse).toEqual({ status: 401, body: 'Missing signature headers' });
		});

		it('should verify valid HMAC signature', async () => {
			const secret = 'dGVzdHNlY3JldA==';
			const body = { eventName: 'contact.created' };
			const rawBody = JSON.stringify(body);
			const webhookId = 'msg_abc123';
			const timestamp = String(Math.floor(Date.now() / 1000));
			const signature = makeSignature(secret, webhookId, timestamp, rawBody);

			const ctx = createMockWebhookFunctions(
				body,
				{
					'webhook-signature': signature,
					'webhook-id': webhookId,
					'webhook-timestamp': timestamp,
				},
				{ events: ['contact.created'] },
				{ signingSecret: secret },
			);
			const result = await trigger.webhook.call(ctx);
			expect(result.workflowData).toBeDefined();
		});

		it('should reject invalid signature', async () => {
			const secret = 'dGVzdHNlY3JldA==';
			const body = { eventName: 'contact.created' };
			const timestamp = String(Math.floor(Date.now() / 1000));

			const ctx = createMockWebhookFunctions(
				body,
				{
					'webhook-signature': 'v1,invalidsignature',
					'webhook-id': 'msg_abc123',
					'webhook-timestamp': timestamp,
				},
				{ events: ['contact.created'] },
				{ signingSecret: secret },
			);
			const result = await trigger.webhook.call(ctx);
			expect(result.webhookResponse).toEqual({ status: 401, body: 'Invalid signature' });
		});

		it('should reject expired timestamps', async () => {
			const secret = 'dGVzdHNlY3JldA==';
			const body = { eventName: 'contact.created' };
			const rawBody = JSON.stringify(body);
			const webhookId = 'msg_abc123';
			const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600);
			const signature = makeSignature(secret, webhookId, oldTimestamp, rawBody);

			const ctx = createMockWebhookFunctions(
				body,
				{
					'webhook-signature': signature,
					'webhook-id': webhookId,
					'webhook-timestamp': oldTimestamp,
				},
				{ events: ['contact.created'] },
				{ signingSecret: secret },
			);
			const result = await trigger.webhook.call(ctx);
			expect(result.webhookResponse).toEqual({ status: 401, body: 'Invalid signature' });
		});

		it('should strip whsec_ prefix from signing secret', async () => {
			const rawSecret = 'dGVzdHNlY3JldA==';
			const prefixedSecret = `whsec_${rawSecret}`;
			const body = { eventName: 'contact.created' };
			const rawBody = JSON.stringify(body);
			const webhookId = 'msg_abc123';
			const timestamp = String(Math.floor(Date.now() / 1000));
			const signature = makeSignature(rawSecret, webhookId, timestamp, rawBody);

			const ctx = createMockWebhookFunctions(
				body,
				{
					'webhook-signature': signature,
					'webhook-id': webhookId,
					'webhook-timestamp': timestamp,
				},
				{ events: [] },
				{ signingSecret: prefixedSecret },
			);
			const result = await trigger.webhook.call(ctx);
			expect(result.workflowData).toBeDefined();
		});
	});
});
