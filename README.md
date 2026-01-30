# Webhooker

HTTP-сервис, который по конфигу принимает запросы и запускает заданные команды. Минимум зависимостей: Node.js, TypeScript, Zod, node:http.

## Назначение

- Принимает HTTP-запросы.
- Сопоставляет метод и путь с роутами из конфига.
- При совпадении проверяет Bearer (если задан) и выполняет одну или несколько команд.
- Возвращает JSON с результатом: время, длительность, число успешных команд, при необходимости — логи команд.

## Требования

- Node.js >= 18

## Установка и запуск

```bash
npm install
npm run build
npm start
```

Конфиг по умолчанию — `config.json` в текущей папке. Путь можно задать переменной окружения:

```bash
WEBHOOKER_CONFIG=env/dev/config.simple.json npm start
```

## Окружения

Конфиги по окружениям лежат в `env/`:

- `env/dev/` — разработка (несколько примеров конфигов).
- `env/test/` — тестовый стенд.
- `env/prod/` — продуктовый стенд.

## Скрипты

- `npm run lint` — проверка кода (ESLint).
- `npm run build` — линт и сборка в папку `build/`.
- `npm start` — запуск из `build/src/main.js`.
- `npm run test` — тесты из `tests/` (приложение из `build/`), вывод покрытия.
- `npm run test:coverage` — тесты и проверка покрытия ≥ 95%.
- `npm run docker:build` — сборка Docker-образа.

## Структура

- `src/config/` — схема и загрузка конфига (Zod).
- `src/core/` — логгер и запуск команд.
- `src/transport/` — HTTP-сервер (node:http).
- `src/main.ts` — точка входа.
- `tests/` — тесты (запуск без сборки тестов, приложение из `build/`).

## Конфиг

JSON с полями:

- `logLevel` — debug | info | warn | error.
- `host`, `port` — хост и порт сервера.
- `routes` — массив роутов. Роут: `method`, `path`, опционально `bearerKey`, `bearerSource` (header | query), `commands`, `timeoutMs`, `includeLogsInResponse`. Команда: `cwd`, `command`, `args`.

Конфиг валидируется Zod-схемой при старте; проверяется уникальность пар (method, path).
