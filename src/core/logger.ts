import { platform, release, totalmem, freemem } from 'node:os';
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	writeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { LogLevel } from '../config/schema';

const LEVEL_ORDER: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
};

const LEVEL_UPPER: Record<LogLevel, string> = {
	debug: 'DEBUG',
	info: 'INFO',
	warn: 'WARN',
	error: 'ERROR',
	fatal: 'FATAL',
};

const LOG_LEVEL_ENV = 'LOG_LEVEL';
const LOG_DIR_ENV = 'LOG_DIR';
const LOG_FILE_SIZE_KB_ENV = 'LOG_FILE_SIZE_KB';

const DEFAULT_LOG_FILE_SIZE_KB = 1024; // 1 MB

function safeTimestampForFilename(iso: string): string {
	return iso.replaceAll(':', '-');
}

function getAppName(): string {
	// 1) npm/yarn/pnpm env (если стартуем через npm scripts)
	const npmName = process.env.npm_package_name;
	if (npmName) return npmName;

	// 2) package.json в cwd (типичный деплой: /opt/webhooker/current)
	try {
		const pkgPath = resolve(process.cwd(), 'package.json');
		const raw = readFileSync(pkgPath, 'utf8');
		const parsed = JSON.parse(raw) as { name?: unknown };
		if (typeof parsed.name === 'string' && parsed.name.trim() !== '') {
			return parsed.name.trim();
		}
	} catch {
		// ignore
	}

	return 'app';
}

function parseMaxFileSizeKb(): number {
	const raw = process.env[LOG_FILE_SIZE_KB_ENV];
	if (!raw) return DEFAULT_LOG_FILE_SIZE_KB;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_LOG_FILE_SIZE_KB;
	return n;
}

/** Метка времени ISO-8601 с высокой точностью (performance). */
function timestampIso(): string {
	return new Date(
		performance.timeOrigin + performance.now(),
	).toISOString();
}

class FileLogWriter {
	private readonly dir: string;
	private readonly appName: string;
	private readonly maxBytes: number;

	private fd: number | null = null;
	private currentBytes = 0;
	private isBroken = false;

	constructor(dir: string) {
		this.dir = resolve(dir);
		this.appName = getAppName();
		this.maxBytes = parseMaxFileSizeKb() * 1024;

		mkdirSync(this.dir, { recursive: true });
		this.openNewFile();

		process.once('exit', () => {
			try {
				this.close();
			} catch {
				// ignore
			}
		});
	}

	getDir(): string {
		return this.dir;
	}

	getMaxBytes(): number {
		return this.maxBytes;
	}

	private buildFilePath(startIso: string): string {
		const start = safeTimestampForFilename(startIso);
		const base = `${this.appName}-${start}.log`;
		let candidate = join(this.dir, base);
		if (!existsSync(candidate)) return candidate;

		for (let i = 1; i < 10_000; i += 1) {
			candidate = join(
				this.dir,
				`${this.appName}-${start}-${i}.log`,
			);
			if (!existsSync(candidate)) return candidate;
		}
		return join(this.dir, `${this.appName}-${Date.now()}.log`);
	}

	private openNewFile(): void {
		this.close();
		const startIso = timestampIso();
		const filePath = this.buildFilePath(startIso);

		try {
			this.fd = openSync(filePath, 'a');
		} catch (err) {
			this.isBroken = true;
			process.stderr.write(
				JSON.stringify({
					level: 'warn',
					message:
						'Ошибка открытия файла логов; файловый логгер отключён',
					error: err instanceof Error ? err.message : String(err),
					dir: this.dir,
					timestamp: timestampIso(),
				}) + '\n',
			);
			return;
		}
		this.currentBytes = 0;
	}

	write(line: string): void {
		if (this.isBroken) return;
		if (this.fd === null) return;

		const bytes = Buffer.byteLength(line, 'utf8');
		if (this.currentBytes + bytes > this.maxBytes) {
			this.openNewFile();
		}
		if (this.fd === null || this.isBroken) return;

		try {
			writeSync(this.fd, line);
			this.currentBytes += bytes;
		} catch (err) {
			this.isBroken = true;
			process.stderr.write(
				JSON.stringify({
					level: 'warn',
					message:
						'Ошибка записи логов в файл; файловый логгер отключён',
					error: err instanceof Error ? err.message : String(err),
					dir: this.dir,
					timestamp: timestampIso(),
				}) + '\n',
			);
		}
	}

	close(): void {
		if (this.fd !== null) {
			try {
				closeSync(this.fd);
			} catch {
				// ignore
			}
			this.fd = null;
		}
	}
}

/**
 * Логгер: запись в stdout в JSON, уровни debug/info/warn/error/fatal,
 * поддержка ошибок unknown и дополнительных полей.
 */
export class Logger {
	private minLevel: LogLevel = 'info';
	private fileWriter: FileLogWriter | null = null;

	/** Устанавливает минимальный уровень логирования. */
	setLogLevel(level: LogLevel): void {
		this.minLevel = level;
		this.syncFileLoggingFromEnv();
	}

	/** Возвращает текущий минимальный уровень логирования. */
	getLogLevel(): LogLevel {
		return this.minLevel;
	}

	/** Читает LOG_LEVEL из env; если не задан — возвращает fallback. */
	initLogLevelFromEnv(fallback: LogLevel): LogLevel {
		const env = process.env[LOG_LEVEL_ENV];
		if (env == null || env === '') {
			return fallback;
		}
		const lower = env.toLowerCase();
		if (
			lower === 'debug' ||
			lower === 'info' ||
			lower === 'warn' ||
			lower === 'error' ||
			lower === 'fatal'
		) {
			return lower as LogLevel;
		}
		return fallback;
	}

	/** Возвращает true, если LOG_LEVEL задан в окружении. */
	isLogLevelSetInEnv(): boolean {
		const v = process.env[LOG_LEVEL_ENV];
		return v != null && v !== '';
	}

	private shouldLog(level: LogLevel): boolean {
		return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
	}

	private buildLine(
		level: LogLevel,
		messageOrData: string | Record<string, unknown>,
		data?: Record<string, unknown>,
	): Record<string, unknown> {
		const isDataOnly =
			typeof messageOrData === 'object' && messageOrData !== null;
		const message = isDataOnly ? undefined : (messageOrData as string);
		const payload = isDataOnly
			? (messageOrData as Record<string, unknown>)
			: data ?? {};
		const { component = 'App', ...rest } = payload as Record<
			string,
			unknown
		> & { component?: string };
		return {
			timestamp: timestampIso(),
			pid: process.pid,
			level: LEVEL_UPPER[level],
			component,
			...(message !== undefined && { message }),
			...(Object.keys(rest).length > 0 ? rest : {}),
		};
	}

	private syncFileLoggingFromEnv(): void {
		const dir = process.env[LOG_DIR_ENV];
		if (!dir) {
			this.fileWriter?.close();
			this.fileWriter = null;
			return;
		}

		const desiredDir = resolve(dir);
		const desiredMaxBytes = parseMaxFileSizeKb() * 1024;

		if (this.fileWriter === null) {
			this.fileWriter = new FileLogWriter(desiredDir);
			return;
		}

		if (
			this.fileWriter.getDir() !== desiredDir ||
			this.fileWriter.getMaxBytes() !== desiredMaxBytes
		) {
			this.fileWriter.close();
			this.fileWriter = new FileLogWriter(desiredDir);
		}
	}

	/** Пишет одну строку лога в stdout в формате JSON. */
	log(
		level: LogLevel,
		messageOrData: string | Record<string, unknown>,
		data?: Record<string, unknown>,
	): void {
		if (!this.shouldLog(level)) return;
		this.syncFileLoggingFromEnv();
		const line = this.buildLine(level, messageOrData, data);
		const raw = JSON.stringify(line) + '\n';
		process.stdout.write(raw);
		this.fileWriter?.write(raw);
	}

	debug(msg: string, data?: Record<string, unknown>): void {
		this.log('debug', msg, data);
	}

	info(
		msgOrData: string | Record<string, unknown>,
		data?: Record<string, unknown>,
	): void {
		this.log('info', msgOrData, data);
	}

	warn(msg: string, data?: Record<string, unknown>): void {
		this.log('warn', msg, data);
	}

	error(msg: string, data?: Record<string, unknown>): void {
		this.log('error', msg, data);
	}

	fatal(msg: string, data?: Record<string, unknown>): void {
		this.log('fatal', msg, data);
	}

	/** Логирует ошибку типа unknown (сообщение и опционально stack). */
	errorUnknown(err: unknown, data?: Record<string, unknown>): void {
		const msg = err instanceof Error ? err.message : String(err);
		const payload = { ...data };
		if (err instanceof Error && err.stack) {
			payload.stack = err.stack;
		}
		this.log('error', msg, payload);
	}

	/** Пишет в лог среду запуска: OS, ОЗУ, cwd, команда, node, pid. */
	logEnv(): void {
		const envPayload = {
			component: 'Main',
			os: `${platform()} ${release()}`,
			ramTotalMb: Math.round(totalmem() / 1024 / 1024),
			ramFreeMb: Math.round(freemem() / 1024 / 1024),
			cwd: process.cwd(),
			command: process.argv[1],
			args: process.argv.slice(2),
			nodeVersion: process.version,
			pid: process.pid,
		};
		this.info('Информация о системе', envPayload);
	}
}

const defaultLogger = new Logger();

export function setLogLevel(level: LogLevel): void {
	defaultLogger.setLogLevel(level);
}

export function getLogLevel(): LogLevel {
	return defaultLogger.getLogLevel();
}

export function initLogLevelFromEnv(fallback: LogLevel): LogLevel {
	return defaultLogger.initLogLevelFromEnv(fallback);
}

export function isLogLevelSetInEnv(): boolean {
	return defaultLogger.isLogLevelSetInEnv();
}

/** Логгер по умолчанию (debug, info, warn, error, fatal, errorUnknown). */
export const logger = defaultLogger;

export function logEnv(): void {
	defaultLogger.logEnv();
}
