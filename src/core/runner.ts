import { spawn } from 'node:child_process';
import type { Command } from '../config/schema';

/** Результат команды: cwd, команда, stdout/stderr, длительность, exitCode. */
export interface CommandResult {
	cwd: string;
	command: string;
	args: string[];
	stdout: string;
	stderr: string;
	durationMs: number;
	startedAt: string;
	finishedAt: string;
	exitCode: number | null;
}

/** Сигнал отмены (например AbortController.signal). */
export interface AbortSignal {
	addEventListener(
		type: 'abort',
		handler: () => void,
		options?: { once?: boolean },
	): void;
}

/** Текущая метка времени в мс (высокая точность, монотонная). */
function nowMs(): number {
	return performance.timeOrigin + performance.now();
}

function normalizeArgs(
	args: (string | number | (string | number)[])[],
): string[] {
	const out: string[] = [];
	for (const a of args) {
		if (Array.isArray(a)) {
			for (const x of a) out.push(String(x));
		} else {
			out.push(String(a));
		}
	}
	return out;
}

/**
 * Выполняет команды в цепочке: одна за другой, стоп при exitCode !== 0
 * или по таймауту; поддерживает AbortSignal для принудительной остановки.
 */
export class CommandRunner {
	/**
	 * Запускает одну команду в cwd;
	 * при signal.abort завершает процесс по SIGTERM.
	 */
	async runSingleCommand(
		cmd: Command,
		signal?: AbortSignal,
	): Promise<CommandResult> {
		const startTs = nowMs();
		const args = normalizeArgs(cmd.args);

		return new Promise((resolve, reject) => {
			const proc = spawn(cmd.command, args, {
				cwd: cmd.cwd,
				shell: false,
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';
			proc.stdout?.on('data', (chunk: Buffer) => {
				stdout += chunk.toString();
			});
			proc.stderr?.on('data', (chunk: Buffer) => {
				stderr += chunk.toString();
			});

			const finish = (exitCode: number | null) => {
				const endTs = nowMs();
				const durationMs = endTs - startTs;
				resolve({
					cwd: cmd.cwd,
					command: cmd.command,
					args,
					stdout,
					stderr,
					durationMs,
					startedAt: new Date(startTs).toISOString(),
					finishedAt: new Date(endTs).toISOString(),
					exitCode,
				});
			};

			proc.on('close', (code) => {
				finish(code);
			});
			proc.on('error', (err) => {
				const endTs = nowMs();
				const durationMs = endTs - startTs;
				resolve({
					cwd: cmd.cwd,
					command: cmd.command,
					args,
					stdout,
					stderr,
					durationMs,
					startedAt: new Date(startTs).toISOString(),
					finishedAt: new Date(endTs).toISOString(),
					exitCode: null,
				});
				reject(err);
			});

			if (signal) {
				signal.addEventListener(
					'abort',
					() => {
						proc.kill('SIGTERM');
					},
					{ once: true },
				);
			}
		});
	}

	/**
	 * Цепочка команд по очереди; стоп при exitCode !== 0 или таймауте.
	 */
	async runCommands(
		commands: Command[],
		timeoutMs: number,
		onCommandResult?: (result: CommandResult) => void,
	): Promise<{ results: CommandResult[]; timedOut: boolean }> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		const results: CommandResult[] = [];

		try {
			for (const cmd of commands) {
				if (controller.signal.aborted) break;
				const result = await this.runSingleCommand(
					cmd,
					controller.signal,
				);
				results.push(result);
				onCommandResult?.(result);
				if (result.exitCode !== 0 || controller.signal.aborted) break;
			}
			return { results, timedOut: controller.signal.aborted };
		} finally {
			clearTimeout(timeout);
		}
	}
}

const defaultRunner = new CommandRunner();

/** Запускает одну команду в cwd; при signal.abort завершает процесс. */
export function runSingleCommand(
	cmd: Command,
	signal?: AbortSignal,
): Promise<CommandResult> {
	return defaultRunner.runSingleCommand(cmd, signal);
}

/** Цепочка команд по очереди; стоп при exitCode !== 0 или таймауте. */
export async function runCommands(
	commands: Command[],
	timeoutMs: number,
	onCommandResult?: (result: CommandResult) => void,
): Promise<{ results: CommandResult[]; timedOut: boolean }> {
	return defaultRunner.runCommands(
		commands,
		timeoutMs,
		onCommandResult,
	);
}
