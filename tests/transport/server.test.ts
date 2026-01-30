import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../build/src/transport/server.js';
import type { Config } from '../../build/src/config/schema.js';

const FIXTURE_PATH = join(
	process.cwd(),
	'tests',
	'fixtures',
	'with-bearer.json',
);

function loadFixtureConfig(): Config {
	const raw = readFileSync(FIXTURE_PATH, 'utf-8');
	const config = JSON.parse(raw) as Config;
	for (const route of config.routes) {
		for (const cmd of route.commands) {
			if (cmd.cwd === '.') cmd.cwd = process.cwd();
		}
	}
	return config;
}

describe('server', () => {
	let server: ReturnType<typeof createServer>;
	let baseUrl: string;
	const testConfig = loadFixtureConfig();

	before((done) => {
		server = createServer(createApp(testConfig));
		server.listen(0, '127.0.0.1', () => {
			const port = (server.address() as AddressInfo).port;
			baseUrl = `http://127.0.0.1:${port}`;
			done();
		});
	});

	after((done) => {
		server.close(done);
	});

	it('returns 404 for unknown route', async () => {
		const res = await fetch(`${baseUrl}/unknown`, { method: 'GET' });
		expect(res.status).to.equal(404);
		expect(await res.text()).to.equal('');
	});

	it('returns 200 and execution info for matching route', async () => {
		const res = await fetch(`${baseUrl}/webhook`, { method: 'POST' });
		expect(res.status).to.equal(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).to.have.property('startedAt');
		expect(body).to.have.property('finishedAt');
		expect(body).to.have.property('durationMs');
		expect(body).to.have.property('totalCommands', 1);
		expect(body).to.have.property('successCount', 1);
		expect(body).to.have.property('commandLogs');
		const logs = body.commandLogs as unknown[];
		expect(logs).to.have.length(1);
		expect(logs[0]).to.have.property('stdout');
		expect((logs[0] as { stdout: string }).stdout.trim()).to.equal('ok');
	});

	it('returns 403 when bearer missing', async () => {
		const res = await fetch(`${baseUrl}/secure`, { method: 'POST' });
		expect(res.status).to.equal(403);
		expect(await res.text()).to.equal('');
	});

	it('returns 200 when bearer in header matches', async () => {
		const res = await fetch(`${baseUrl}/secure`, {
			method: 'POST',
			headers: { Authorization: 'Bearer secret123' },
		});
		expect(res.status).to.equal(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).to.have.property('successCount', 1);
	});

	it('returns 200 when bearer in query matches', async () => {
		const res = await fetch(`${baseUrl}/query-auth?bearer=query-secret`, {
			method: 'GET',
		});
		expect(res.status).to.equal(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).to.have.property('successCount', 1);
	});

	it('returns 403 when bearer in query wrong', async () => {
		const res = await fetch(`${baseUrl}/query-auth?bearer=wrong`, {
			method: 'GET',
		});
		expect(res.status).to.equal(403);
		expect(await res.text()).to.equal('');
	});

	it('method mismatch returns 404', async () => {
		const res = await fetch(`${baseUrl}/webhook`, { method: 'GET' });
		expect(res.status).to.equal(404);
		expect(await res.text()).to.equal('');
	});

	it('route with includeLogsInResponse false has no commandLogs in body', async () => {
		const res = await fetch(`${baseUrl}/secure`, {
			method: 'POST',
			headers: { Authorization: 'Bearer secret123' },
		});
		expect(res.status).to.equal(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).not.to.have.property('commandLogs');
	});

	it('bearer from query param token', async () => {
		const res = await fetch(`${baseUrl}/query-auth?token=query-secret`, {
			method: 'GET',
		});
		expect(res.status).to.equal(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).to.have.property('successCount', 1);
	});

	it('route with two commands returns commandLogs for both', async () => {
		const res = await fetch(`${baseUrl}/two-cmds`, { method: 'POST' });
		expect(res.status).to.equal(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).to.have.property('totalCommands', 2);
		expect(body).to.have.property('successCount', 2);
		const logs = body.commandLogs as unknown[];
		expect(logs).to.have.length(2);
		expect((logs[0] as { stdout: string }).stdout.trim()).to.equal('first');
		expect((logs[1] as { stdout: string }).stdout.trim()).to.equal('second');
	});
});
