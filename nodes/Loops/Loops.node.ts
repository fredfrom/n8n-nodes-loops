import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { loopsApiRequest } from './GenericFunctions';

function collectKeyValuePairs(
	collection: { property?: Array<{ key: string; value: string }> } | undefined,
): Record<string, string> {
	const result: Record<string, string> = {};
	if (collection?.property) {
		for (const { key, value } of collection.property) {
			result[key] = value;
		}
	}
	return result;
}

function parseJsonField(value: unknown): Record<string, unknown> {
	if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
	return (value ?? {}) as Record<string, unknown>;
}

function requireOneOf(
	ctx: IExecuteFunctions,
	itemIndex: number,
	email: string,
	userId: string,
	exclusive: boolean,
) {
	if (exclusive && email && userId) {
		throw new NodeOperationError(ctx.getNode(), 'Provide either Email or User ID, not both', {
			itemIndex,
		});
	}
	if (!email && !userId) {
		throw new NodeOperationError(ctx.getNode(), 'Either Email or User ID must be provided', {
			itemIndex,
		});
	}
}

async function executeContact(
	ctx: IExecuteFunctions,
	i: number,
	operation: string,
): Promise<JsonObject | JsonObject[]> {
	if (operation === 'create' || operation === 'update') {
		const body: Record<string, unknown> = {};
		const email = ctx.getNodeParameter('email', i) as string;

		if (operation === 'create') {
			body.email = email;
		} else {
			const userId = ctx.getNodeParameter('userId', i) as string;
			requireOneOf(ctx, i, email, userId, false);
			if (email) body.email = email;
			if (userId) body.userId = userId;
		}

		const fields = ctx.getNodeParameter('additionalFields', i) as Record<string, unknown>;
		for (const [key, value] of Object.entries(fields)) {
			if (value === undefined || value === '') continue;
			body[key] = key === 'mailingLists' ? parseJsonField(value) : value;
		}

		Object.assign(
			body,
			collectKeyValuePairs(
				ctx.getNodeParameter('customProperties', i) as {
					property?: Array<{ key: string; value: string }>;
				},
			),
		);

		const isCreate = operation === 'create';
		return (await loopsApiRequest.call(
			ctx,
			isCreate ? 'POST' : 'PUT',
			isCreate ? '/contacts/create' : '/contacts/update',
			body,
		)) as JsonObject;
	}

	const email = ctx.getNodeParameter('email', i) as string;
	const userId = ctx.getNodeParameter('userId', i) as string;
	requireOneOf(ctx, i, email, userId, true);

	if (operation === 'find') {
		const qs: Record<string, string> = {};
		if (email) qs.email = email;
		if (userId) qs.userId = userId;
		return (await loopsApiRequest.call(ctx, 'GET', '/contacts/find', {}, qs)) as JsonObject[];
	}

	if (operation === 'delete') {
		const body: Record<string, unknown> = {};
		if (email) body.email = email;
		if (userId) body.userId = userId;
		return (await loopsApiRequest.call(ctx, 'POST', '/contacts/delete', body)) as JsonObject;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown operation: ${operation}`);
}

async function executeEvent(ctx: IExecuteFunctions, i: number): Promise<JsonObject> {
	const email = ctx.getNodeParameter('email', i) as string;
	const userId = ctx.getNodeParameter('userId', i) as string;
	requireOneOf(ctx, i, email, userId, false);

	const body: Record<string, unknown> = {
		eventName: ctx.getNodeParameter('eventName', i) as string,
	};
	if (email) body.email = email;
	if (userId) body.userId = userId;

	const eventProps = collectKeyValuePairs(
		ctx.getNodeParameter('eventProperties', i) as {
			property?: Array<{ key: string; value: string }>;
		},
	);
	if (Object.keys(eventProps).length > 0) body.eventProperties = eventProps;

	Object.assign(
		body,
		collectKeyValuePairs(
			ctx.getNodeParameter('contactProperties', i) as {
				property?: Array<{ key: string; value: string }>;
			},
		),
	);

	const mailingLists = ctx.getNodeParameter('mailingLists', i) as string;
	if (mailingLists && mailingLists !== '{}') {
		body.mailingLists = parseJsonField(mailingLists);
	}

	const headers: Record<string, string> = {};
	const idempotencyKey = ctx.getNodeParameter('idempotencyKey', i) as string;
	if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.substring(0, 100);

	return (await loopsApiRequest.call(ctx, 'POST', '/events/send', body, {}, headers)) as JsonObject;
}

async function executeTransactionalEmail(
	ctx: IExecuteFunctions,
	i: number,
	operation: string,
	returnData: INodeExecutionData[],
): Promise<JsonObject | undefined> {
	if (operation === 'send') {
		const body: Record<string, unknown> = {
			transactionalId: ctx.getNodeParameter('transactionalId', i) as string,
			email: ctx.getNodeParameter('email', i) as string,
		};

		if (ctx.getNodeParameter('addToAudience', i) as boolean) body.addToAudience = true;

		const dataVars = ctx.getNodeParameter('dataVariables', i) as {
			variable?: Array<{ key: string; value: string }>;
		};
		if (dataVars.variable?.length) {
			const vars: Record<string, string> = {};
			for (const { key, value } of dataVars.variable) vars[key] = value;
			body.dataVariables = vars;
		}

		const attachments = ctx.getNodeParameter('attachments', i) as {
			attachment?: Array<{ filename: string; contentType: string; data: string }>;
		};
		if (attachments.attachment?.length) {
			body.attachments = attachments.attachment.map(({ filename, contentType, data }) => ({
				filename,
				contentType,
				data,
			}));
		}

		const headers: Record<string, string> = {};
		const idempotencyKey = ctx.getNodeParameter('idempotencyKey', i) as string;
		if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

		return (await loopsApiRequest.call(ctx, 'POST', '/transactional', body, {}, headers)) as JsonObject;
	}

	if (operation === 'list') {
		const qs: Record<string, string | number> = {
			perPage: ctx.getNodeParameter('perPage', i) as number,
		};
		const cursor = ctx.getNodeParameter('cursor', i) as string;
		if (cursor) qs.cursor = cursor;

		const response = (await loopsApiRequest.call(ctx, 'GET', '/transactional', {}, qs)) as JsonObject;
		for (const item of (response.data as JsonObject[] | undefined) ?? []) {
			returnData.push({ json: item, pairedItem: { item: i } });
		}
		if (response.pagination) returnData.push({ json: { pagination: response.pagination }, pairedItem: { item: i } });
		return undefined;
	}

	throw new NodeOperationError(ctx.getNode(), `Unknown operation: ${operation}`);
}

export class Loops implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Loops',
		name: 'loops',
		icon: 'file:loops.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the Loops API',
		defaults: { name: 'Loops' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'loopsApi', required: true }],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'API Key', value: 'apiKey' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Contact Property', value: 'contactProperty' },
					{ name: 'Dedicated Sending IP', value: 'dedicatedSendingIp' },
					{ name: 'Event', value: 'event' },
					{ name: 'Mailing List', value: 'mailingList' },
					{ name: 'Transactional Email', value: 'transactionalEmail' },
				],
				default: 'contact',
			},

			// --- API Key operations ---
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['apiKey'] } },
				options: [
					{ name: 'Test', value: 'test', action: 'Test API key', description: 'Validate that the API key is valid' },
				],
				default: 'test',
			},

			// --- Contact operations ---
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['contact'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a contact', description: 'Create a new contact' },
					{ name: 'Delete', value: 'delete', action: 'Delete a contact', description: 'Delete a contact by email or user ID' },
					{ name: 'Find', value: 'find', action: 'Find a contact', description: 'Find a contact by email or user ID' },
					{ name: 'Update', value: 'update', action: 'Update a contact', description: 'Update an existing contact' },
				],
				default: 'create',
			},

			// --- Contact Property operations ---
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['contactProperty'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a contact property', description: 'Create a custom contact property' },
					{ name: 'List', value: 'list', action: 'List contact properties', description: 'List all contact properties' },
				],
				default: 'list',
			},

			// --- Dedicated Sending IP operations ---
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['dedicatedSendingIp'] } },
				options: [
					{ name: 'List', value: 'list', action: 'List dedicated sending ips', description: 'Retrieve dedicated sending IP addresses' },
				],
				default: 'list',
			},

			// --- Event operations ---
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['event'] } },
				options: [
					{ name: 'Send', value: 'send', action: 'Send an event', description: 'Send an event for a contact' },
				],
				default: 'send',
			},

			// --- Mailing List operations ---
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['mailingList'] } },
				options: [
					{ name: 'List', value: 'list', action: 'List mailing lists', description: 'List all mailing lists' },
				],
				default: 'list',
			},

			// --- Transactional Email operations ---
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['transactionalEmail'] } },
				options: [
					{ name: 'List', value: 'list', action: 'List transactional emails', description: 'List transactional email templates' },
					{ name: 'Send', value: 'send', action: 'Send a transactional email', description: 'Send a transactional email' },
				],
				default: 'send',
			},

			// --- Contact fields ---
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['contact'], operation: ['create'] } },
				description: 'Email address of the contact',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				displayOptions: { show: { resource: ['contact'], operation: ['update'] } },
				description: 'Email address of the contact (required if User ID is not set)',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				displayOptions: { show: { resource: ['contact'], operation: ['find', 'delete'] } },
				description: 'Email address (provide either Email or User ID, not both)',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['contact'], operation: ['update', 'find', 'delete'] } },
				description: 'User ID of the contact',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
				options: [
					{ displayName: 'First Name', name: 'firstName', type: 'string', default: '' },
					{ displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
					{
						displayName: 'Mailing Lists',
						name: 'mailingLists',
						type: 'json',
						default: '{}',
						description: 'Object of list IDs to boolean, e.g. {"list_abc": true}',
					},
					{
						displayName: 'Source',
						name: 'source',
						type: 'string',
						default: '',
						description: 'How the contact was acquired, e.g. "website"',
					},
					{ displayName: 'Subscribed', name: 'subscribed', type: 'boolean', default: true },
					{ displayName: 'User Group', name: 'userGroup', type: 'string', default: '' },
					{
						displayName: 'User ID',
						name: 'userId',
						type: 'string',
						default: '',
						displayOptions: { show: { '/operation': ['create'] } },
					},
				],
			},
			{
				displayName: 'Custom Properties',
				name: 'customProperties',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Custom Property',
				default: {},
				displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
				options: [
					{
						displayName: 'Property',
						name: 'property',
						values: [
							{ displayName: 'Key', name: 'key', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},

			// --- Contact Property fields ---
			{
				displayName: 'Name',
				name: 'propertyName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['contactProperty'], operation: ['create'] } },
				description: 'Property key in camelCase, e.g. "planName"',
			},
			{
				displayName: 'Label',
				name: 'label',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['contactProperty'], operation: ['create'] } },
				description: 'Human-readable label for the property',
			},
			{
				displayName: 'Type',
				name: 'propertyType',
				type: 'options',
				default: 'string',
				required: true,
				displayOptions: { show: { resource: ['contactProperty'], operation: ['create'] } },
				options: [
					{ name: 'Boolean', value: 'boolean' },
					{ name: 'Date', value: 'date' },
					{ name: 'Number', value: 'number' },
					{ name: 'String', value: 'string' },
				],
			},
			{
				displayName: 'Filter',
				name: 'filter',
				type: 'options',
				default: 'all',
				displayOptions: { show: { resource: ['contactProperty'], operation: ['list'] } },
				options: [
					{ name: 'All', value: 'all' },
					{ name: 'Custom Only', value: 'custom' },
				],
				description: 'Return all properties or only custom ones',
			},

			// --- Event fields ---
			{
				displayName: 'Event Name',
				name: 'eventName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['event'], operation: ['send'] } },
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				displayOptions: { show: { resource: ['event'], operation: ['send'] } },
				description: 'Provide at least Email or User ID',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['event'], operation: ['send'] } },
			},
			{
				displayName: 'Event Properties',
				name: 'eventProperties',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Event Property',
				default: {},
				displayOptions: { show: { resource: ['event'], operation: ['send'] } },
				options: [
					{
						displayName: 'Property',
						name: 'property',
						values: [
							{ displayName: 'Key', name: 'key', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Contact Properties',
				name: 'contactProperties',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Contact Property',
				default: {},
				displayOptions: { show: { resource: ['event'], operation: ['send'] } },
				options: [
					{
						displayName: 'Property',
						name: 'property',
						values: [
							{ displayName: 'Key', name: 'key', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Mailing Lists',
				name: 'mailingLists',
				type: 'json',
				default: '{}',
				displayOptions: { show: { resource: ['event'], operation: ['send'] } },
				description: 'Object of list IDs to boolean, e.g. {"list_abc": true}',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['event'], operation: ['send'] } },
				description: 'Unique key to prevent duplicate events (max 100 characters)',
			},

			// --- Transactional Email fields ---
			{
				displayName: 'Transactional ID',
				name: 'transactionalId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['transactionalEmail'], operation: ['send'] } },
				description: 'ID of the published transactional email template',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['transactionalEmail'], operation: ['send'] } },
				description: 'Recipient email address',
			},
			{
				displayName: 'Data Variables',
				name: 'dataVariables',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Data Variable',
				default: {},
				displayOptions: { show: { resource: ['transactionalEmail'], operation: ['send'] } },
				options: [
					{
						displayName: 'Variable',
						name: 'variable',
						values: [
							{ displayName: 'Key', name: 'key', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Attachments',
				name: 'attachments',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Attachment',
				default: {},
				displayOptions: { show: { resource: ['transactionalEmail'], operation: ['send'] } },
				options: [
					{
						displayName: 'Attachment',
						name: 'attachment',
						values: [
							{
								displayName: 'Filename',
								name: 'filename',
								type: 'string',
								default: '',
								description: 'Name of the file, e.g. "report.pdf"',
							},
							{
								displayName: 'Content Type',
								name: 'contentType',
								type: 'string',
								default: 'application/pdf',
								description: 'MIME type, e.g. "application/pdf"',
							},
							{
								displayName: 'Data (Base64)',
								name: 'data',
								type: 'string',
								default: '',
								description: 'Base64-encoded file content',
							},
						],
					},
				],
			},
			{
				displayName: 'Add to Audience',
				name: 'addToAudience',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['transactionalEmail'], operation: ['send'] } },
				description: "Whether to add the recipient as a contact if they don't exist",
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['transactionalEmail'], operation: ['send'] } },
				description: 'Unique key to prevent duplicate sends',
			},
			{
				displayName: 'Per Page',
				name: 'perPage',
				type: 'number',
				default: 20,
				typeOptions: { minValue: 10, maxValue: 50 },
				displayOptions: { show: { resource: ['transactionalEmail'], operation: ['list'] } },
				description: 'Number of results per page (10\u201350)',
			},
			{
				displayName: 'Cursor',
				name: 'cursor',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['transactionalEmail'], operation: ['list'] } },
				description: 'Pagination cursor from a previous response',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: JsonObject | JsonObject[] | undefined;

				if (resource === 'apiKey') {
					responseData = (await loopsApiRequest.call(this, 'GET', '/api-key')) as JsonObject;
				} else if (resource === 'contact') {
					responseData = await executeContact(this, i, operation);
				} else if (resource === 'contactProperty') {
					if (operation === 'create') {
						responseData = (await loopsApiRequest.call(this, 'POST', '/contacts/properties', {
							name: this.getNodeParameter('propertyName', i) as string,
							label: this.getNodeParameter('label', i) as string,
							type: this.getNodeParameter('propertyType', i) as string,
						})) as JsonObject;
					} else {
						const filter = this.getNodeParameter('filter', i) as string;
						const qs: Record<string, string> = {};
						if (filter !== 'all') qs.list = filter;
						responseData = (await loopsApiRequest.call(this, 'GET', '/contacts/properties', {}, qs)) as JsonObject[];
					}
				} else if (resource === 'dedicatedSendingIp') {
					const ips = await loopsApiRequest.call(this, 'GET', '/dedicated-sending-ips');
					if (Array.isArray(ips)) {
						for (const ip of ips) {
							returnData.push({ json: typeof ip === 'string' ? { ip } : ip, pairedItem: { item: i } });
						}
					}
					continue;
				} else if (resource === 'event') {
					responseData = await executeEvent(this, i);
				} else if (resource === 'mailingList') {
					responseData = (await loopsApiRequest.call(this, 'GET', '/lists')) as JsonObject[];
				} else if (resource === 'transactionalEmail') {
					responseData = await executeTransactionalEmail(this, i, operation, returnData);
					if (responseData === undefined) continue;
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`);
				}

				if (responseData !== undefined) {
					if (Array.isArray(responseData)) {
						for (const item of responseData) {
							returnData.push({ json: item, pairedItem: { item: i } });
						}
					} else {
						returnData.push({ json: responseData, pairedItem: { item: i } });
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
