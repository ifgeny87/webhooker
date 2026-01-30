import { describe, it } from 'mocha';
import { expect } from 'chai';
import { runSingleCommand, runCommands } from '../../build/src/core/runner.js';
import { platform } from 'node:os';

describe('runner', () => {
	const isWin = platform() === 'win32';
	const nodeCmd = 'node';

	it('runSingleCommand returns stdout and exitCode 0', async () => {
		const result = await runSingleCommand({
			cwd: process.cwd(),
			command: nodeCmd,
			args: ['-e', "console.log('hello')"],
		});
		expect(result.exitCode).to.equal(0);
		expect(result.stdout.trim()).to.equal('hello');
		expect(result.command).to.equal(nodeCmd);
		expect(result.startedAt).to.be.a('string');
		expect(result.finishedAt).to.be.a('string');
		expect(result.durationMs).to.be.a('number');
	});

	it('runSingleCommand normalizes args (string, number, array)', async () => {
		const result = await runSingleCommand({
			cwd: process.cwd(),
			command: nodeCmd,
			args: ['-e', 'console.log(process.argv[2], process.argv[3])', 'a', 1],
		});
		expect(result.exitCode).to.equal(0);
		expect(result.args).to.deep.equal(['-e', 'console.log(process.argv[2], process.argv[3])', 'a', '1']);
	});

	it('runSingleCommand returns exitCode non-zero for failing command', async () => {
		const result = await runSingleCommand({
			cwd: process.cwd(),
			command: nodeCmd,
			args: ['-e', 'process.exit(2)'],
		});
		expect(result.exitCode).to.equal(2);
	});

	it('runCommands runs chain until success', async () => {
		const results: unknown[] = [];
		const { results: out, timedOut } = await runCommands(
			[
				{ cwd: process.cwd(), command: nodeCmd, args: ['-e', 'process.exit(0)'] },
				{ cwd: process.cwd(), command: nodeCmd, args: ['-e', 'process.exit(0)'] },
			],
			5000,
			(r) => results.push(r),
		);
		expect(out).to.have.length(2);
		expect(out.every((r) => r.exitCode === 0)).to.be.true;
		expect(timedOut).to.be.false;
		expect(results).to.have.length(2);
	});

	it('runCommands stops on first non-zero exit', async () => {
		const { results, timedOut } = await runCommands(
			[
				{ cwd: process.cwd(), command: nodeCmd, args: ['-e', 'process.exit(0)'] },
				{ cwd: process.cwd(), command: nodeCmd, args: ['-e', 'process.exit(1)'] },
				{ cwd: process.cwd(), command: nodeCmd, args: ['-e', 'process.exit(0)'] },
			],
			5000,
		);
		expect(results).to.have.length(2);
		expect(results[0].exitCode).to.equal(0);
		expect(results[1].exitCode).to.equal(1);
		expect(timedOut).to.be.false;
	});

	it('runCommands respects timeout', async () => {
		const longRunning = isWin
			? { cwd: process.cwd(), command: 'node', args: ['-e', 'setTimeout(()=>{}, 5000)'] }
			: { cwd: process.cwd(), command: 'sleep', args: ['5'] };
		const { results, timedOut } = await runCommands(
			[longRunning],
			200,
		);
		expect(results.length).to.be.lessThanOrEqual(1);
		expect(timedOut).to.be.true;
	}).timeout(5000);

	it('runSingleCommand captures stderr', async () => {
		const result = await runSingleCommand({
			cwd: process.cwd(),
			command: nodeCmd,
			args: ['-e', "console.error('stderr out')"],
		});
		expect(result.exitCode).to.equal(0);
		expect(result.stderr.trim()).to.equal('stderr out');
	});

	it('runSingleCommand with empty args', async () => {
		const result = await runSingleCommand({
			cwd: process.cwd(),
			command: nodeCmd,
			args: [],
		});
		expect(result.args).to.deep.equal([]);
		expect(result.exitCode).to.equal(0);
	});

	it('runSingleCommand resolves with exitCode null when command not found', async () => {
		const result = await runSingleCommand({
			cwd: process.cwd(),
			command: 'nonexistentcommand12345',
			args: [],
		});
		expect(result.exitCode).to.equal(null);
		expect(result.command).to.equal('nonexistentcommand12345');
	});

	it('runCommands with single command', async () => {
		const { results, timedOut } = await runCommands(
			[
				{
					cwd: process.cwd(),
					command: nodeCmd,
					args: ['-e', 'console.log(1)'],
				},
			],
			5000,
		);
		expect(results).to.have.length(1);
		expect(results[0].exitCode).to.equal(0);
		expect(timedOut).to.be.false;
	});
});
