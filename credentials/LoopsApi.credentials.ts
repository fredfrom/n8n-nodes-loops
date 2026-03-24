import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LoopsApi implements ICredentialType {
	name = 'loopsApi';

	displayName = 'Loops API';

	icon = { light: 'file:../nodes/Loops/loops.svg', dark: 'file:../nodes/Loops/loops.svg' } as const;

	documentationUrl = 'https://loops.so/docs/api-reference';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.loops.so/api/v1',
			url: '/api-key',
		},
	};
}
