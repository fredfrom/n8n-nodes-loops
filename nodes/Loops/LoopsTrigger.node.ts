import { createHmac } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

const WEBHOOK_EVENTS = [
	{ name: 'Campaign Email Sent', value: 'campaign.email.sent' },
	{ name: 'Contact Created', value: 'contact.created' },
	{ name: 'Contact Deleted', value: 'contact.deleted' },
	{ name: 'Contact Mailing List Subscribed', value: 'contact.mailingList.subscribed' },
	{ name: 'Contact Mailing List Unsubscribed', value: 'contact.mailingList.unsubscribed' },
	{ name: 'Contact Unsubscribed', value: 'contact.unsubscribed' },
	{ name: 'Email Clicked', value: 'email.clicked' },
	{ name: 'Email Delivered', value: 'email.delivered' },
	{ name: 'Email Hard Bounced', value: 'email.hardBounced' },
	{ name: 'Email Opened', value: 'email.opened' },
	{ name: 'Email Resubscribed', value: 'email.resubscribed' },
	{ name: 'Email Soft Bounced', value: 'email.softBounced' },
	{ name: 'Email Spam Reported', value: 'email.spamReported' },
	{ name: 'Email Unsubscribed', value: 'email.unsubscribed' },
	{ name: 'Loop Email Sent', value: 'loop.email.sent' },
	{ name: 'Test Event', value: 'testing.testEvent' },
	{ name: 'Transactional Email Sent', value: 'transactional.email.sent' },
];

const MAX_TIMESTAMP_DRIFT_SECONDS = 300;

function verifySignature(
	signingSecret: string,
	signatureHeader: string,
	webhookId: string,
	webhookTimestamp: string,
	rawBody: string,
): boolean {
	const timestamp = parseInt(webhookTimestamp, 10);
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestamp) > MAX_TIMESTAMP_DRIFT_SECONDS) return false;

	const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
	const secretBytes = Buffer.from(signingSecret.replace(/^whsec_/, ''), 'base64');
	const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

	return signatureHeader.split(' ').some((sig) => {
		const parts = sig.split(',');
		return parts.length === 2 && parts[1] === expected;
	});
}

export class LoopsTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Loops Trigger',
		name: 'loopsTrigger',
		icon: 'file:loops.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Loops sends a webhook event',
		defaults: { name: 'Loops Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'loopsWebhookApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: [],
				description: 'Which Loops webhook events to listen for',
				options: WEBHOOK_EVENTS,
			},
			{
				displayName:
					'Configure the webhook URL in your Loops dashboard under Settings \u2192 Webhooks. ' +
					'Copy the URL shown in the "Webhook URLs" section below and paste it there. ' +
					'Enable the events you want to receive in the Loops dashboard.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const body = req.body as Record<string, unknown>;
		const credentials = await this.getCredentials('loopsWebhookApi');
		const signingSecret = credentials.signingSecret as string;

		if (signingSecret) {
			const signature = req.headers['webhook-signature'] as string | undefined;
			const id = req.headers['webhook-id'] as string | undefined;
			const timestamp = req.headers['webhook-timestamp'] as string | undefined;

			if (!signature || !id || !timestamp) {
				return { webhookResponse: { status: 401, body: 'Missing signature headers' } };
			}

			const rawBody = req.rawBody?.toString() ?? JSON.stringify(body);
			if (!verifySignature(signingSecret, signature, id, timestamp, rawBody)) {
				return { webhookResponse: { status: 401, body: 'Invalid signature' } };
			}
		}

		const events = this.getNodeParameter('events') as string[];
		const eventName = body.eventName as string;

		if (events.length > 0 && !events.includes(eventName)) {
			return { webhookResponse: { status: 200, body: 'Event ignored' } };
		}

		return {
			workflowData: [this.helpers.returnJsonArray(body as IDataObject)],
		};
	}
}
