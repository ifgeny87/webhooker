import type { Server } from 'node:http';
import { ConfigLoader } from './config/loader';
import {
	setLogLevel,
	initLogLevelFromEnv,
	isLogLevelSetInEnv,
	logEnv,
	logger,
} from './core/logger';
import { WebhookServer } from './transport/server';

const GRACEFUL_SHUTDOWN_MS = 5000;

/**
 * Обработка сигналов завершения: плавное закрытие сервера (5 с)
 * или немедленный выход при повторном сигнале.
 */
function setupGracefulShutdown(server: Server): void {
	let isShuttingDown = false;
	let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

	function shutdown(signal: string): void {
		if (isShuttingDown) {
			logger.warn('Повторный сигнал завершения, немедленный выход', {
				component: 'Main',
				signal,
			});
			process.exit(1);
		}
		isShuttingDown = true;
		logger.info('Получен сигнал завершения, начинается плавное завершение', {
			component: 'Main',
			signal,
		});
		shutdownTimeout = setTimeout(() => {
			logger.info('Таймаут ожидания закрытия соединений истёк', {
				component: 'Main',
			});
			process.exit(1);
		}, GRACEFUL_SHUTDOWN_MS);
		server.once('close', () => {
			if (shutdownTimeout !== null) clearTimeout(shutdownTimeout);
			logger.info('Сервер закрыт', { component: 'Server' });
			process.exit(0);
		});
		server.close();
	}

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
}

/** Точка входа: загрузка конфига, настройка логгера, запуск веб-листенера. */
function main(): void {
	const configLoader = new ConfigLoader();
	const config = configLoader.load();

	const level = initLogLevelFromEnv(config.logLevel);
	setLogLevel(level);
	if (!isLogLevelSetInEnv()) {
		logger.warn('Переменная окружения LOG_LEVEL не задана', {
			component: 'Main',
			defaultLevel: 'INFO',
		});
	}
	logEnv();
	const webhookServer = new WebhookServer(config);
	const server = webhookServer.start();
	setupGracefulShutdown(server);
}

main();
