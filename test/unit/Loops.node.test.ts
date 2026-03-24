import { Loops } from '../../nodes/Loops/Loops.node';
import { createMockExecuteFunctions } from './helpers';

describe('Loops Node', () => {
	let node: Loops;

	beforeEach(() => {
		node = new Loops();
	});

	describe('description', () => {
		it('should have correct metadata', () => {
			expect(node.description.name).toBe('loops');
			expect(node.description.displayName).toBe('Loops');
			expect(node.description.version).toBe(1);
			expect(node.description.usableAsTool).toBe(true);
			expect(node.description.credentials).toEqual([{ name: 'loopsApi', required: true }]);
		});

		it('should define all seven resources', () => {
			const resourceProp = node.description.properties.find((p) => p.name === 'resource');
			expect(resourceProp).toBeDefined();
			const values = (resourceProp!.options as Array<{ value: string }>).map((o) => o.value);
			expect(values).toEqual([
				'apiKey',
				'contact',
				'contactProperty',
				'dedicatedSendingIp',
				'event',
				'mailingList',
				'transactionalEmail',
			]);
		});
	});

	describe('API Key — test', () => {
		it('should call GET /api-key', async () => {
			const mockResponse = { success: true, teamName: 'Test' };
			const ctx = createMockExecuteFunctions(
				{ resource: { 0: 'apiKey' }, operation: { 0: 'test' } },
				mockResponse,
			);
			const result = await node.execute.call(ctx);
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual(mockResponse);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({
					method: 'GET',
					url: 'https://app.loops.so/api/v1/api-key',
				}),
			);
		});
	});

	describe('Contact — create', () => {
		it('should call POST /contacts/create with email and fields', async () => {
			const mockResponse = { success: true, id: 'c123' };
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'contact' },
					operation: { 0: 'create' },
					email: { 0: 'test@example.com' },
					additionalFields: { 0: { firstName: 'Jane', source: 'api' } },
					customProperties: { 0: { property: [{ key: 'plan', value: 'pro' }] } },
				},
				mockResponse,
			);
			const result = await node.execute.call(ctx);
			expect(result[0][0].json).toEqual(mockResponse);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({
					method: 'POST',
					url: 'https://app.loops.so/api/v1/contacts/create',
					body: { email: 'test@example.com', firstName: 'Jane', source: 'api', plan: 'pro' },
				}),
			);
		});
	});

	describe('Contact — update', () => {
		it('should call PUT /contacts/update', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'contact' },
					operation: { 0: 'update' },
					email: { 0: 'test@example.com' },
					userId: { 0: '' },
					additionalFields: { 0: { firstName: 'Updated' } },
					customProperties: { 0: {} },
				},
				{ success: true, id: 'c123' },
			);
			await node.execute.call(ctx);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({
					method: 'PUT',
					url: 'https://app.loops.so/api/v1/contacts/update',
				}),
			);
		});

		it('should throw if neither email nor userId provided', async () => {
			const ctx = createMockExecuteFunctions({
				resource: { 0: 'contact' },
				operation: { 0: 'update' },
				email: { 0: '' },
				userId: { 0: '' },
				additionalFields: { 0: {} },
				customProperties: { 0: {} },
			});
			await expect(node.execute.call(ctx)).rejects.toThrow(
				'Either Email or User ID must be provided',
			);
		});
	});

	describe('Contact — find', () => {
		it('should call GET /contacts/find with email query', async () => {
			const contacts = [{ id: 'c1', email: 'test@example.com' }];
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'contact' },
					operation: { 0: 'find' },
					email: { 0: 'test@example.com' },
					userId: { 0: '' },
				},
				contacts,
			);
			const result = await node.execute.call(ctx);
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual(contacts[0]);
		});

		it('should throw if both email and userId provided', async () => {
			const ctx = createMockExecuteFunctions({
				resource: { 0: 'contact' },
				operation: { 0: 'find' },
				email: { 0: 'test@example.com' },
				userId: { 0: 'u123' },
			});
			await expect(node.execute.call(ctx)).rejects.toThrow(
				'Provide either Email or User ID, not both',
			);
		});
	});

	describe('Contact — delete', () => {
		it('should call POST /contacts/delete', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'contact' },
					operation: { 0: 'delete' },
					email: { 0: 'test@example.com' },
					userId: { 0: '' },
				},
				{ success: true, message: 'Contact deleted' },
			);
			const result = await node.execute.call(ctx);
			expect(result[0][0].json).toEqual({ success: true, message: 'Contact deleted' });
		});
	});

	describe('Contact Property — list', () => {
		it('should call GET /contacts/properties', async () => {
			const props = [{ key: 'firstName', label: 'First Name', type: 'string' }];
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'contactProperty' },
					operation: { 0: 'list' },
					filter: { 0: 'all' },
				},
				props,
			);
			const result = await node.execute.call(ctx);
			expect(result[0]).toHaveLength(1);
		});

		it('should pass custom filter as query param', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'contactProperty' },
					operation: { 0: 'list' },
					filter: { 0: 'custom' },
				},
				[],
			);
			await node.execute.call(ctx);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({ qs: { list: 'custom' } }),
			);
		});
	});

	describe('Contact Property — create', () => {
		it('should call POST /contacts/properties with name, label, type', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'contactProperty' },
					operation: { 0: 'create' },
					propertyName: { 0: 'planName' },
					label: { 0: 'Plan Name' },
					propertyType: { 0: 'string' },
				},
				{ success: true },
			);
			await node.execute.call(ctx);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({
					method: 'POST',
					body: { name: 'planName', label: 'Plan Name', type: 'string' },
				}),
			);
		});
	});

	describe('Dedicated Sending IP — list', () => {
		it('should wrap string IPs in objects', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'dedicatedSendingIp' },
					operation: { 0: 'list' },
				},
				['1.2.3.4', '5.6.7.8'],
			);
			const result = await node.execute.call(ctx);
			expect(result[0]).toHaveLength(2);
			expect(result[0][0].json).toEqual({ ip: '1.2.3.4' });
			expect(result[0][1].json).toEqual({ ip: '5.6.7.8' });
		});
	});

	describe('Event — send', () => {
		it('should call POST /events/send with eventProperties nested', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'event' },
					operation: { 0: 'send' },
					eventName: { 0: 'signup' },
					email: { 0: 'test@example.com' },
					userId: { 0: '' },
					eventProperties: { 0: { property: [{ key: 'plan', value: 'pro' }] } },
					contactProperties: { 0: {} },
					mailingLists: { 0: '{}' },
					idempotencyKey: { 0: '' },
				},
				{ success: true },
			);
			await node.execute.call(ctx);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({
					body: {
						eventName: 'signup',
						email: 'test@example.com',
						eventProperties: { plan: 'pro' },
					},
				}),
			);
		});

		it('should include idempotency key header when provided', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'event' },
					operation: { 0: 'send' },
					eventName: { 0: 'test' },
					email: { 0: 'test@example.com' },
					userId: { 0: '' },
					eventProperties: { 0: {} },
					contactProperties: { 0: {} },
					mailingLists: { 0: '{}' },
					idempotencyKey: { 0: 'unique-key-123' },
				},
				{ success: true },
			);
			await node.execute.call(ctx);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({
					headers: { 'Idempotency-Key': 'unique-key-123' },
				}),
			);
		});

		it('should throw if no email or userId', async () => {
			const ctx = createMockExecuteFunctions({
				resource: { 0: 'event' },
				operation: { 0: 'send' },
				eventName: { 0: 'test' },
				email: { 0: '' },
				userId: { 0: '' },
				eventProperties: { 0: {} },
				contactProperties: { 0: {} },
				mailingLists: { 0: '{}' },
				idempotencyKey: { 0: '' },
			});
			await expect(node.execute.call(ctx)).rejects.toThrow(
				'Either Email or User ID must be provided',
			);
		});
	});

	describe('Mailing List — list', () => {
		it('should call GET /lists', async () => {
			const lists = [{ id: 'l1', name: 'Newsletter', isPublic: true }];
			const ctx = createMockExecuteFunctions(
				{ resource: { 0: 'mailingList' }, operation: { 0: 'list' } },
				lists,
			);
			const result = await node.execute.call(ctx);
			expect(result[0]).toHaveLength(1);
			expect(result[0][0].json).toEqual(lists[0]);
		});
	});

	describe('Transactional Email — send', () => {
		it('should call POST /transactional with data variables', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'transactionalEmail' },
					operation: { 0: 'send' },
					transactionalId: { 0: 'tmpl_123' },
					email: { 0: 'test@example.com' },
					addToAudience: { 0: true },
					dataVariables: { 0: { variable: [{ key: 'name', value: 'Jane' }] } },
					attachments: { 0: {} },
					idempotencyKey: { 0: '' },
				},
				{ success: true },
			);
			await node.execute.call(ctx);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({
					body: {
						transactionalId: 'tmpl_123',
						email: 'test@example.com',
						addToAudience: true,
						dataVariables: { name: 'Jane' },
					},
				}),
			);
		});

		it('should include attachments when provided', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'transactionalEmail' },
					operation: { 0: 'send' },
					transactionalId: { 0: 'tmpl_123' },
					email: { 0: 'test@example.com' },
					addToAudience: { 0: false },
					dataVariables: { 0: {} },
					attachments: {
						0: {
							attachment: [
								{ filename: 'report.pdf', contentType: 'application/pdf', data: 'base64data' },
							],
						},
					},
					idempotencyKey: { 0: '' },
				},
				{ success: true },
			);
			await node.execute.call(ctx);
			expect(ctx.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
				'loopsApi',
				expect.objectContaining({
					body: expect.objectContaining({
						attachments: [{ filename: 'report.pdf', contentType: 'application/pdf', data: 'base64data' }],
					}),
				}),
			);
		});
	});

	describe('Transactional Email — list', () => {
		it('should call GET /transactional with pagination', async () => {
			const ctx = createMockExecuteFunctions(
				{
					resource: { 0: 'transactionalEmail' },
					operation: { 0: 'list' },
					perPage: { 0: 25 },
					cursor: { 0: 'abc' },
				},
				{ data: [{ id: 't1', name: 'Welcome' }], pagination: { totalResults: 1 } },
			);
			const result = await node.execute.call(ctx);
			expect(result[0]).toHaveLength(2);
			expect(result[0][0].json).toEqual({ id: 't1', name: 'Welcome' });
			expect(result[0][1].json).toEqual({ pagination: { totalResults: 1 } });
		});
	});

	describe('continueOnFail', () => {
		it('should return error object when continueOnFail is true', async () => {
			const ctx = createMockExecuteFunctions({
				resource: { 0: 'contact' },
				operation: { 0: 'find' },
				email: { 0: '' },
				userId: { 0: '' },
			});
			(ctx as unknown as { continueOnFail: () => boolean }).continueOnFail = () => true;
			const result = await node.execute.call(ctx);
			expect(result[0][0].json).toHaveProperty('error');
		});
	});
});
