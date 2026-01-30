import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
	configSchema,
	routeSchema,
	commandSchema,
} from '../../build/src/config/schema.js';

describe('config schema', () => {
	it('accepts valid full config', () => {
		const raw = {
			logLevel: 'info',
			host: '0.0.0.0',
			port: 3000,
			routes: [
				{
					method: 'POST',
					path: '/webhook',
					commands: [
						{ cwd: '/tmp', command: 'echo', args: ['hi'] },
					],
					timeoutMs: 5000,
				},
			],
		};
		const result = configSchema.parse(raw);
		expect(result.port).to.equal(3000);
		expect(result.routes).to.have.length(1);
		expect(result.routes[0].bearerSource).to.equal('header');
		expect(result.routes[0].includeLogsInResponse).to.equal(false);
	});

	it('applies defaults', () => {
		const raw = {
			port: 8080,
			routes: [
				{
					method: 'GET',
					path: '/',
					commands: [{ cwd: '.', command: 'true' }],
					timeoutMs: 1000,
				},
			],
		};
		const result = configSchema.parse(raw);
		expect(result.logLevel).to.equal('info');
		expect(result.host).to.equal('127.0.0.1');
	});

	it('rejects invalid log level', () => {
		expect(() =>
			configSchema.parse({
				logLevel: 'invalid',
				port: 3000,
				routes: [],
			}),
		).to.throw();
	});

	it('rejects missing routes', () => {
		expect(() =>
			configSchema.parse({
				port: 3000,
				routes: [],
			}),
		).to.throw();
	});

	it('rejects invalid port', () => {
		expect(() =>
			configSchema.parse({
				port: -1,
				routes: [
					{
						method: 'GET',
						path: '/',
						commands: [{ cwd: '.', command: 'true' }],
						timeoutMs: 1000,
					},
				],
			}),
		).to.throw();
	});

	it('rejects when routes key is missing', () => {
		expect(() =>
			configSchema.parse({
				port: 3000,
			}),
		).to.throw();
	});
});

describe('route schema', () => {
	it('accepts bearerSource query', () => {
		const r = routeSchema.parse({
			method: 'POST',
			path: '/x',
			bearerKey: 'secret',
			bearerSource: 'query',
			commands: [{ cwd: '.', command: 'echo', args: [] }],
			timeoutMs: 5000,
		});
		expect(r.bearerSource).to.equal('query');
	});

	it('accepts args as string and number and array', () => {
		const c = commandSchema.parse({
			cwd: '.',
			command: 'cmd',
			args: ['a', 1, ['b', 2]],
		});
		expect(c.args).to.deep.equal(['a', 1, ['b', 2]]);
	});

	it('transforms args as single string to array', () => {
		const c = commandSchema.parse({
			cwd: '.',
			command: 'cmd',
			args: 'single',
		});
		expect(c.args).to.deep.equal(['single']);
	});

	it('transforms args as single number to array', () => {
		const c = commandSchema.parse({
			cwd: '.',
			command: 'cmd',
			args: 42,
		});
		expect(c.args).to.deep.equal([42]);
	});

	it('defaults args to empty array when omitted', () => {
		const c = commandSchema.parse({
			cwd: '.',
			command: 'cmd',
		});
		expect(c.args).to.deep.equal([]);
	});

	it('defaults method to GET and bearerSource to header', () => {
		const r = routeSchema.parse({
			path: '/x',
			commands: [{ cwd: '.', command: 'echo' }],
			timeoutMs: 1000,
		});
		expect(r.method).to.equal('GET');
		expect(r.bearerSource).to.equal('header');
	});
});
