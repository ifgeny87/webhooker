import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configSchema, type Config } from './schema';

const DEFAULT_CONFIG_PATH = 'config.json';
const ENV_CONFIG_PATH = 'WEBHOOKER_CONFIG';

/** Возвращает метку времени ISO-8601 с высокой точностью (performance). */
function timestampIso(): string {
	return new Date(
		performance.timeOrigin + performance.now(),
	).toISOString();
}

/**
 * Загрузчик конфигурации: путь из env, чтение файла, валидация Zod,
 * проверка уникальности роутов.
 */
export class ConfigLoader {
	private readonly envPathKey = ENV_CONFIG_PATH;
	private readonly defaultPath = DEFAULT_CONFIG_PATH;

	/** Возвращает путь к конфигу из WEBHOOKER_CONFIG или config.json в cwd. */
	getConfigPath(): string {
		const envPath = process.env[this.envPathKey];
		if (!envPath) {
			return resolve(process.cwd(), this.defaultPath);
		}
		return resolve(envPath);
	}

	/**
	 * Проверяет уникальность роутов по паре method+path;
	 * при дубликате выбрасывает ошибку.
	 */
	validateRouteUniqueness(routes: Config['routes']): void {
		const seen = new Set<string>();
		for (const r of routes) {
			const key = `${r.method}:${r.path}`;
			if (seen.has(key)) {
				throw new Error(`Duplicate route: ${r.method} ${r.path}`);
			}
			seen.add(key);
		}
	}

	/**
	 * Читает и валидирует конфиг по Zod-схеме;
	 * при отсутствии WEBHOOKER_CONFIG пишет предупреждение в stderr.
	 */
	load(): Config {
		const path = this.getConfigPath();
		if (!process.env[this.envPathKey]) {
			process.stderr.write(
				JSON.stringify({
					level: 'warn',
					message: 'Переменная окружения WEBHOOKER_CONFIG не задана',
					path,
					timestamp: timestampIso(),
				}) + '\n',
			);
		}
		const raw = readFileSync(path, 'utf-8');
		const parsed = JSON.parse(raw) as unknown;
		const config = configSchema.parse(parsed);
		this.validateRouteUniqueness(config.routes);
		return config;
	}
}

const defaultLoader = new ConfigLoader();

/** Возвращает путь к конфигу из WEBHOOKER_CONFIG или config.json в cwd. */
export function getConfigPath(): string {
	return defaultLoader.getConfigPath();
}

/** Читает и валидирует конфиг по Zod-схеме; проверяет уникальность роутов. */
export function loadConfig(): Config {
	return defaultLoader.load();
}

/** Проверяет уникальность роутов по паре method+path; при дубликате — throw. */
export function validateRouteUniqueness(routes: Config['routes']): void {
	defaultLoader.validateRouteUniqueness(routes);
}
