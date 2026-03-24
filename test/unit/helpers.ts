import type {
	IExecuteFunctions,
	IHookFunctions,
	IWebhookFunctions,
	INodeExecutionData,
	IDataObject,
} from 'n8n-workflow';

type ParamMap = Record<string, Record<number, unknown>>;

export function createMockExecuteFunctions(
	params: ParamMap = {},
	apiResponse: unknown = { success: true },
): IExecuteFunctions {
	return {
		getInputData: () => [{ json: {} }] as INodeExecutionData[],
		getNodeParameter: ((name: string, index: number) => {
			if (params[name] !== undefined && params[name][index] !== undefined) {
				return params[name][index];
			}
			const defaults: Record<string, unknown> = {
				resource: 'contact',
				operation: 'create',
				email: '',
				userId: '',
				additionalFields: {},
				customProperties: {},
				eventProperties: {},
				contactProperties: {},
				mailingLists: '{}',
				idempotencyKey: '',
				filter: 'all',
				addToAudience: false,
				dataVariables: {},
				attachments: {},
				perPage: 20,
				cursor: '',
			};
			return defaults[name] ?? '';
		}) as IExecuteFunctions['getNodeParameter'],
		getNode: () => ({ name: 'Loops', type: 'n8n-nodes-loops.loops', typeVersion: 1, position: [0, 0], parameters: {} }),
		helpers: {
			httpRequestWithAuthentication: jest.fn().mockResolvedValue(apiResponse),
		} as unknown as IExecuteFunctions['helpers'],
		continueOnFail: () => false,
	} as unknown as IExecuteFunctions;
}

export function createMockWebhookFunctions(
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
	params: Record<string, unknown> = {},
	credentials: Record<string, unknown> = {},
): IWebhookFunctions {
	return {
		getRequestObject: () => ({
			body,
			headers,
		}),
		getCredentials: jest.fn().mockResolvedValue(credentials),
		getNodeParameter: ((name: string) => params[name] ?? []) as IWebhookFunctions['getNodeParameter'],
		getNode: () => ({ name: 'Loops Trigger', type: 'n8n-nodes-loops.loopsTrigger', typeVersion: 1, position: [0, 0], parameters: {} }),
		helpers: {
			returnJsonArray: (data: IDataObject) => [{ json: data }] as INodeExecutionData[],
		} as unknown as IWebhookFunctions['helpers'],
	} as unknown as IWebhookFunctions;
}

export function createMockHookFunctions(): IHookFunctions {
	return {} as unknown as IHookFunctions;
}
