import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
	type Server,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Config, Route } from '../config/schema';
import { getLogLevel, logger } from '../core/logger';
import { runCommands, type CommandResult } from '../core/runner';

/** Текущая метка времени в мс (высокая точность, монотонная). */
function nowMs(): number {
	return performance.timeOrigin + performance.now();
}

/**
 * HTTP-сервер вебхуков: маршрутизация по method+path, bearer,
 * выполнение цепочки команд по конфигу.
 */
export class WebhookServer {
	constructor(private readonly config: Config) {}

	/** Ищет роут по method и pathname. */
	private findRoute(
		method: string,
		pathname: string,
	): Route | undefined {
		return this.config.routes.find(
			(r) => r.method === method && r.path === pathname,
		);
	}

	/** Извлекает bearer из заголовка или query (по настройке роута). */
	private getBearerToken(req: IncomingMessage, route: Route): string | null {
		if (route.bearerSource === 'query') {
			const u = new URL(req.url ?? '', `http://${req.headers.host}`);
			return u.searchParams.get('bearer') ?? u.searchParams.get('token') ?? null;
		}
		const auth = req.headers.authorization;
		if (!auth || !auth.startsWith('Bearer ')) return null;
		return auth.slice(7).trim() || null;
	}

	/** Отправляет ответ с пустым телом (для 404, 403). */
	private sendEmpty(res: ServerResponse, statusCode: number): void {
		res.writeHead(statusCode);
		res.end();
	}

	/** Отправляет JSON-ответ с заданным статусом. */
	private sendJson(
		res: ServerResponse,
		statusCode: number,
		body: unknown,
	): void {
		res.writeHead(statusCode, {
			'Content-Type': 'application/json',
		});
		res.end(JSON.stringify(body));
	}

	/** Логирует запрос после отправки ответа. */
	private logAfterResponse(
		requestId: string,
		method: string,
		path: string,
		receivedAt: number,
		statusCode: number,
	): void {
		const lengthMs = nowMs() - receivedAt;
		const data = {
			component: 'Server',
			method,
			path,
			status: statusCode,
			uuid: requestId,
			startedAt: new Date(receivedAt).toISOString(),
			lengthMs,
		};
		if (statusCode >= 500) {
			logger.error('Ошибка выполнения роута', data);
		} else {
			logger.info(data);
		}
	}

	/** Выполняет роут (цепочку команд) и формирует тело ответа. */
	private async runRoute(
		route: Route,
		requestId: string,
	): Promise<Record<string, unknown>> {
		const startTs = nowMs();
		const isDebug = getLogLevel() === 'debug';

		const onCommandResult = (result: CommandResult) => {
			if (isDebug) {
				logger.debug('🔧 Выполняю команду', {
					component: 'Server',
					requestId,
					cwd: result.cwd,
					command: result.command,
					args: result.args,
					stdout: result.stdout,
					stderr: result.stderr,
					startedAt: result.startedAt,
					finishedAt: result.finishedAt,
					durationMs: result.durationMs,
					exitCode: result.exitCode,
				});
			}
		};

		const { results, timedOut } = await runCommands(
			route.commands,
			route.timeoutMs,
			onCommandResult,
		);

		const endTs = nowMs();
		const durationMs = endTs - startTs;
		const totalCommands = route.commands.length;
		const successCount = results.filter((r) => r.exitCode === 0).length;

		const body: Record<string, unknown> = {
			startedAt: new Date(startTs).toISOString(),
			finishedAt: new Date(endTs).toISOString(),
			durationMs,
			totalCommands,
			successCount,
			timedOut,
		};

		if (route.includeLogsInResponse) {
			body.commandLogs = results.map((r) => ({
				cwd: r.cwd,
				command: r.command,
				args: r.args,
				stdout: r.stdout,
				stderr: r.stderr,
				durationMs: r.durationMs,
			}));
		}

		return body;
	}

	/** Возвращает обработчик HTTP-запросов для node:http createServer. */
	createRequestListener(): (
		req: IncomingMessage,
		res: ServerResponse,
	) => void {
		return (req: IncomingMessage, res: ServerResponse): void => {
			const requestId = randomUUID();
			const receivedAt = nowMs();

			req.on('data', () => {});
			req.on('end', () => {
				const method = req.method ?? 'GET';
				const url = new URL(req.url ?? '', `http://${req.headers.host}`);
				const pathname = url.pathname;

				const route = this.findRoute(method, pathname);
				if (!route) {
					this.sendEmpty(res, 404);
					this.logAfterResponse(
						requestId, method, pathname, receivedAt, 404,
					);
					return;
				}

				if (route.bearerKey != null && route.bearerKey !== '') {
					const token = this.getBearerToken(req, route);
					if (token !== route.bearerKey) {
						this.sendEmpty(res, 403);
						this.logAfterResponse(
							requestId, method, pathname, receivedAt, 403,
						);
						return;
					}
				}

				this.runRoute(route, requestId)
					.then((body) => {
						this.sendJson(res, 200, body);
						this.logAfterResponse(
							requestId, method, pathname, receivedAt, 200,
						);
					})
					.catch((err) => {
						logger.error('Ошибка выполнения роута', {
							component: 'Server',
							requestId,
							error: String(err),
						});
						this.sendJson(res, 500, { error: 'Internal Server Error' });
						this.logAfterResponse(
							requestId, method, pathname, receivedAt, 500,
						);
					});
			});
		};
	}

	/**
	 * Создаёт HTTP-сервер, запускает listen на host:port из конфига,
	 * возвращает Server.
	 */
	start(): Server {
		const app = this.createRequestListener();
		const server = createServer(app);
		server.listen(this.config.port, this.config.host, () => {
			logger.info('Сервер запущен', {
				component: 'Server',
				host: this.config.host,
				port: this.config.port,
			});
		});
		return server;
	}
}

/** Создаёт обработчик HTTP-запросов: маршрутизация, bearer, запуск команд. */
export function createApp(config: Config): (
	req: IncomingMessage,
	res: ServerResponse,
) => void {
	return new WebhookServer(config).createRequestListener();
}

/** Запускает HTTP-сервер на host:port из конфига. */
export function startServer(config: Config): Server {
	return new WebhookServer(config).start();
}
