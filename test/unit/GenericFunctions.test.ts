import { loopsApiRequest } from '../../nodes/Loops/GenericFunctions';
import type { IExecuteFunctions, JsonObject } from 'n8n-workflow';

describe('loopsApiRequest', () => {
	function createCtx(response: unknown, shouldThrow = false) {
		const mock = jest.fn();
		if (shouldThrow) {
			mock.mockRejectedValue(response);
		} else {
			mock.mockResolvedValue(response);
		}
		return {
			helpers: { httpRequestWithAuthentication: mock },
			getNode: () => ({ name: 'Loops', type: 'n8n-nodes-loops.loops', typeVersion: 1, position: [0, 0], parameters: {} }),
		} as unknown as IExecuteFunctions;
	}

	it('should build correct request options for GET', async () => {
		const ctx = createCtx({ success: true });
		await loopsApiRequest.call(ctx, 'GET', '/api-key');
		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith('loopsApi', {
			method: 'GET',
			url: 'https://app.loops.so/api/v1/api-key',
			qs: {},
			headers: {},
			returnFullResponse: false,
		});
	});

	it('should include body for POST requests', async () => {
		const ctx = createCtx({ success: true });
		await loopsApiRequest.call(ctx, 'POST', '/contacts/create', { email: 'a@b.com' });
		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'loopsApi',
			expect.objectContaining({ body: { email: 'a@b.com' } }),
		);
	});

	it('should not include body when empty', async () => {
		const ctx = createCtx({ success: true });
		await loopsApiRequest.call(ctx, 'GET', '/lists');
		const callArgs = (ctx.helpers.httpRequestWithAuthentication as jest.Mock).mock.calls[0][1];
		expect(callArgs.body).toBeUndefined();
	});

	it('should pass query string and headers', async () => {
		const ctx = createCtx([]);
		await loopsApiRequest.call(ctx, 'GET', '/contacts/find', {}, { email: 'a@b.com' }, { 'X-Custom': 'yes' });
		expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'loopsApi',
			expect.objectContaining({
				qs: { email: 'a@b.com' },
				headers: { 'X-Custom': 'yes' },
			}),
		);
	});

	it('should throw rate limit error for 429 status', async () => {
		const ctx = createCtx({ statusCode: 429 } as JsonObject, true);
		await expect(loopsApiRequest.call(ctx, 'GET', '/api-key')).rejects.toThrow(/rate limit/i);
	});

	it('should rethrow other errors as NodeApiError', async () => {
		const ctx = createCtx({ statusCode: 400, message: 'Bad request' } as JsonObject, true);
		await expect(loopsApiRequest.call(ctx, 'POST', '/contacts/create', { email: '' })).rejects.toThrow();
	});
});
