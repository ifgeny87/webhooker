import { platform, release, totalmem, freemem } from 'node:os';
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

/** Метка времени ISO-8601 с высокой точностью (performance). */
function timestampIso(): string {
	return new Date(
		performance.timeOrigin + performance.now(),
	).toISOString();
}

/**
 * Логгер: запись в stdout в JSON, уровни debug/info/warn/error/fatal,
 * поддержка ошибок unknown и дополнительных полей.
 */
export class Logger {
	private minLevel: LogLevel = 'info';

	/** Устанавливает минимальный уровень логирования. */
	setLogLevel(level: LogLevel): void {
		this.minLevel = level;
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

	/** Пишет одну строку лога в stdout в формате JSON. */
	log(
		level: LogLevel,
		messageOrData: string | Record<string, unknown>,
		data?: Record<string, unknown>,
	): void {
		if (!this.shouldLog(level)) return;
		const line = this.buildLine(level, messageOrData, data);
		process.stdout.write(JSON.stringify(line) + '\n');
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
