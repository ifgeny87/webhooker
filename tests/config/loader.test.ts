import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { join } from 'node:path';
import { getConfigPath, loadConfig, validateRouteUniqueness } from '../../build/src/config/loader.js';

describe('loader', () => {
	const originalEnv = process.env.WEBHOOKER_CONFIG;

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.WEBHOOKER_CONFIG = originalEnv;
		} else {
			delete process.env.WEBHOOKER_CONFIG;
		}
	});

	it('getConfigPath returns default when env not set', () => {
		delete process.env.WEBHOOKER_CONFIG;
		const path = getConfigPath();
		expect(path).to.match(/config\.json$/);
	});

	it('getConfigPath returns resolved env path when set', () => {
		process.env.WEBHOOKER_CONFIG = '/custom/config.json';
		expect(getConfigPath()).to.include('custom');
		expect(getConfigPath()).to.include('config.json');
	});

	it('loadConfig loads and validates json from fixture', () => {
		const configPath = join(
			process.cwd(),
			'tests',
			'fixtures',
			'valid.json',
		);
		process.env.WEBHOOKER_CONFIG = configPath;
		const config = loadConfig();
		expect(config.port).to.equal(9999);
		expect(config.routes).to.have.length(1);
	});

	it('validateRouteUniqueness throws on duplicate method+path', () => {
		const routes = [
			{
				method: 'GET',
				path: '/a',
				commands: [{ cwd: '.', command: 'true' }],
				timeoutMs: 1000,
			},
			{
				method: 'GET',
				path: '/a',
				commands: [{ cwd: '.', command: 'true' }],
				timeoutMs: 1000,
			},
		];
		expect(() => validateRouteUniqueness(routes as never)).to.throw(
			'Duplicate route',
		);
	});

	it('validateRouteUniqueness allows same path different method', () => {
		const routes = [
			{
				method: 'GET',
				path: '/a',
				commands: [{ cwd: '.', command: 'true' }],
				timeoutMs: 1000,
			},
			{
				method: 'POST',
				path: '/a',
				commands: [{ cwd: '.', command: 'true' }],
				timeoutMs: 1000,
			},
		];
		expect(() => validateRouteUniqueness(routes as never)).not.to.throw();
	});

	it('loadConfig throws when file does not exist', () => {
		process.env.WEBHOOKER_CONFIG = join(
			process.cwd(),
			'tests',
			'fixtures',
			'nonexistent.json',
		);
		expect(() => loadConfig()).to.throw();
	});

	it('loadConfig throws when file is invalid JSON', () => {
		process.env.WEBHOOKER_CONFIG = join(
			process.cwd(),
			'tests',
			'fixtures',
			'invalid.json',
		);
		expect(() => loadConfig()).to.throw();
	});

	it('loadConfig throws when schema validation fails', () => {
		process.env.WEBHOOKER_CONFIG = join(
			process.cwd(),
			'tests',
			'fixtures',
			'invalid-schema.json',
		);
		expect(() => loadConfig()).to.throw();
	});
});
