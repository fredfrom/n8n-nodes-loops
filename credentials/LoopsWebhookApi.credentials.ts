import type {
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LoopsWebhookApi implements ICredentialType {
	name = 'loopsWebhookApi';

	displayName = 'Loops Webhook API';

	icon = { light: 'file:../nodes/Loops/loops.svg', dark: 'file:../nodes/Loops/loops.svg' } as const;

	documentationUrl = 'https://loops.so/docs/webhooks';

	properties: INodeProperties[] = [
		{
			displayName: 'Signing Secret',
			name: 'signingSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Webhook signing secret from the Loops dashboard (Settings \u2192 Webhooks). Leave empty to skip signature verification.',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.loops.so',
			url: '/',
			method: 'HEAD',
			skipSslCertificateValidation: false,
		},
	};
}
