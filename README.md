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

## Установка на сервер (Ubuntu / Debian) из GitHub Releases

### Что нужно установить на сервере

- Node.js (>= 18) и `npm`
- `curl`, `tar`, `python3` (для скачивания последнего релиза одной командой)

Пример установки Node.js (рекомендуется LTS 20.x):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg tar python3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

### Скачать последнюю версию релиза (готовая команда)

Команда скачает **последний релиз**, распакует в `/opt/webhooker/current`:

```bash
set -euo pipefail
REPO="ifgeny87/webhooker"
INSTALL_DIR="/opt/webhooker"

sudo mkdir -p "$INSTALL_DIR"
sudo chown "$USER":"$USER" "$INSTALL_DIR"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

asset_url="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | python3 -c 'import sys,json,re; d=json.load(sys.stdin); print(next(a["browser_download_url"] for a in d.get("assets", []) if re.match(r"^webhooker-.*\\.tgz$", a.get("name",""))))')"
curl -fL "$asset_url" -o "$tmp_dir/webhooker.tgz"

sudo rm -rf "$INSTALL_DIR/current"
sudo mkdir -p "$INSTALL_DIR/current"
sudo tar -xzf "$tmp_dir/webhooker.tgz" -C "$INSTALL_DIR/current" --strip-components=1
sudo chown -R "$USER":"$USER" "$INSTALL_DIR/current"
```

Дальше — установка зависимостей и пробный запуск:

```bash
cd /opt/webhooker/current
npm install --omit=dev

# пример: указать конфиг и запустить
WEBHOOKER_CONFIG=/etc/webhooker/config.json node src/main.js
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

### Как задаётся конфиг

- Если `WEBHOOKER_CONFIG` **не задан**, приложение ищет `./config.json` в текущей директории (cwd).
- Если `WEBHOOKER_CONFIG` **задан**, путь берётся из переменной окружения (можно относительный или абсолютный).

Пример:

```bash
WEBHOOKER_CONFIG=/etc/webhooker/config.json node src/main.js
```

### Примеры конфигурации

Минимальный пример (без Bearer):

```json
{
  "logLevel": "info",
  "host": "127.0.0.1",
  "port": 3000,
  "routes": [
    {
      "method": "GET",
      "path": "/health",
      "commands": [
        { "command": "echo", "args": "ok" }
      ]
    }
  ]
}
```

Пример с Bearer в заголовке `Authorization: Bearer <token>`:

```json
{
  "host": "0.0.0.0",
  "port": 3000,
  "routes": [
    {
      "method": "POST",
      "path": "/deploy",
      "bearerKey": "production-secret",
      "bearerSource": "header",
      "timeoutMs": 60000,
      "includeLogsInResponse": false,
      "commands": [
        {
          "cwd": "/opt/apps/my-app",
          "command": "/usr/bin/git",
          "args": ["pull", "--ff-only"]
        }
      ]
    }
  ]
}
```

Пример с Bearer в query-параметре (например `/deploy?token=...`):

```json
{
  "routes": [
    {
      "method": "POST",
      "path": "/deploy",
      "bearerKey": "production-secret",
      "bearerSource": "query",
      "commands": [{ "command": "echo", "args": ["ok", 1] }]
    }
  ]
}
```

## Автозапуск и работа в фоне (systemd)

Ниже пример unit-файла для Ubuntu/Debian. Он запускает приложение из `/opt/webhooker/current`,
а конфиг берёт из `/etc/webhooker/config.json`.

- (Рекомендуется) создайте системного пользователя:

```bash
sudo useradd --system --home /opt/webhooker --shell /usr/sbin/nologin webhooker || true
sudo chown -R webhooker:webhooker /opt/webhooker
```

- Создайте конфиг приложения:

```bash
sudo mkdir -p /etc/webhooker
sudo nano /etc/webhooker/config.json
```

- Создайте `systemd` unit-файл:

```bash
sudo nano /etc/systemd/system/webhooker.service
```

Содержимое:

```ini
[Unit]
Description=Webhooker HTTP service
After=network.target

[Service]
Type=simple
User=webhooker
Group=webhooker
WorkingDirectory=/opt/webhooker/current
Environment=WEBHOOKER_CONFIG=/etc/webhooker/config.json
Environment=LOG_LEVEL=info
ExecStart=/usr/bin/node src/main.js
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
```

- Активируйте и запустите:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now webhooker
sudo systemctl status webhooker --no-pager
```

Логи:

```bash
journalctl -u webhooker -n 200 --no-pager
journalctl -u webhooker -f
```

Важно: сервис выполняет команды из `routes.commands`. Для надёжности используйте **абсолютные пути**
в `command` и корректный `cwd`, а также убедитесь, что у пользователя сервиса есть права на эти файлы/папки.
