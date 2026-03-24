import type {
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

const BASE_URL = 'https://app.loops.so/api/v1';

export async function loopsApiRequest(
	this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: Record<string, unknown> = {},
	qs: Record<string, string | number> = {},
	headers: Record<string, string> = {},
): Promise<JsonObject | JsonObject[]> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${endpoint}`,
		qs,
		headers,
		returnFullResponse: false,
	};

	if (Object.keys(body).length > 0) {
		options.body = body;
	}

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'loopsApi',
			options,
		)) as JsonObject | JsonObject[];
	} catch (error) {
		const statusCode = (error as JsonObject).statusCode as number | undefined;
		if (statusCode === 429) {
			throw new NodeApiError(this.getNode(), error as JsonObject, {
				message: 'Loops rate limit reached (10 req/s). Please retry shortly.',
			});
		}
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}
