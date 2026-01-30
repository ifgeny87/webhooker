import { z } from 'zod';

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error', 'fatal']);

const bearerSourceSchema = z.enum(['header', 'query']);

const commandArgsSchema = z.union([
	z.string(),
	z.number(),
	z.array(z.union([z.string(), z.number()])),
]);

/**
 * Аргументы команды: одна строка/число или массив строк/чисел;
 * после парсинга всегда массив.
 */
const argsSchema = z
	.union([
		z.string(),
		z.number(),
		z.array(commandArgsSchema),
	])
	.optional()
	.default([])
	.transform((v) =>
		v === undefined || v === null ? [] : Array.isArray(v) ? v : [v],
	);

/**
 * Схема одной команды: рабочая папка (опц.), исполняемый файл,
 * аргументы (опц.).
 */
export const commandSchema = z.object({
	cwd: z.string().optional().default('.'),
	command: z.string(),
	args: argsSchema,
});

/**
 * Схема роута: метод (опц. GET), путь, bearer, команды,
 * таймаут (опц. 1 мин), логи.
 */
export const routeSchema = z.object({
	method: z.string().optional().default('GET'),
	path: z.string(),
	bearerKey: z.string().optional(),
	bearerSource: bearerSourceSchema.optional().default('header'),
	commands: z.array(commandSchema).min(1),
	timeoutMs: z.number().int().positive().optional().default(60_000),
	includeLogsInResponse: z.boolean().optional().default(false),
});

/**
 * Схема конфига: уровень лога, хост (опц. 127.0.0.1),
 * порт (опц. 3000), роуты.
 */
export const configSchema = z.object({
	logLevel: logLevelSchema.default('info'),
	host: z.string().optional().default('127.0.0.1'),
	port: z.number().int().positive().optional().default(3000),
	routes: z.array(routeSchema).min(1),
});

export type Config = z.infer<typeof configSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Command = z.infer<typeof commandSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
