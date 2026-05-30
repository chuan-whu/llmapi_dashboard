# CPA Usage Keeper

[中文说明](./README.zh.md)

CPA Usage Keeper is now a read-only dashboard for an existing Keeper SQLite database.

Give the application a path to an existing `app.db`, and it serves the usage overview, analysis, and request event dashboard from that database. It does not connect to CPA, pull Redis usage data, sync metadata, refresh quota, write backups, or mutate the database.

<p float="left">
  <img src="https://images.bitskyline.com/i/2026/05/govoah.png" width="49%" />
  <img src="https://images.bitskyline.com/i/2026/05/fu4lec.png" width="49%" />
</p>
<p float="left">
  <img src="https://images.bitskyline.com/i/2026/05/fu43px.png" width="49%" />
  <img src="https://images.bitskyline.com/i/2026/05/fu4gh3.png" width="49%" />
</p>

## Features

- Read-only access to an existing CPA Usage Keeper `app.db`
- Dashboard for request volume, tokens, cost, cache hit rate, success rate, and latency
- Time range and API key filters
- Analysis page for token trends, API key composition, model composition, and heatmaps
- Request event log with model, source, result, pagination, and time range filters
- Optional deployment under a reverse-proxy subpath with `APP_BASE_PATH`

## Quick Start

Create a `.env` file and point `APP_DB_PATH` at your existing database:

```bash
cp .env.example .env
vim .env
```

```env
APP_DB_PATH=/absolute/path/to/app.db
APP_PORT=8080
APP_BASE_PATH=
AUTH_ENABLED=false
LOGIN_PASSWORD=replace-with-your-login-password
AUTH_SESSION_TTL=168h
```

Start the service:

```bash
./cpa-usage-keeper
```

Open `http://127.0.0.1:8080`.

## Deployment

### Docker Compose

`docker-compose.example.yml` is a read-only dashboard template:

```yaml
services:
  cpa-usage-keeper:
    image: ghcr.io/willxup/cpa-usage-keeper:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      APP_DB_PATH: /data/app.db
      APP_PORT: 8080
      APP_BASE_PATH: ""
      AUTH_ENABLED: "false"
      LOGIN_PASSWORD: replace-with-your-login-password
      AUTH_SESSION_TTL: 168h
    volumes:
      - ./data/app.db:/data/app.db:ro
```

Start:

```bash
docker compose up -d
```

Stop:

```bash
docker compose down
```

The mounted database file must be readable by the container user.

### Docker

```bash
docker run -d \
  --name cpa-usage-keeper \
  -p 8080:8080 \
  -e APP_DB_PATH=/data/app.db \
  -e APP_PORT=8080 \
  -e AUTH_ENABLED=false \
  -v "$(pwd)/data/app.db:/data/app.db:ro" \
  ghcr.io/willxup/cpa-usage-keeper:latest
```

### Linux Binary

#### Download

Download the Linux binary package for your architecture from [Releases](https://github.com/Willxup/cpa-usage-keeper/releases/latest), or use the command line:

```bash
curl -L -o cpa-usage-keeper.tar.gz "<replace-with-linux-binary-download-url>"
mkdir -p cpa-usage-keeper
tar -xzf cpa-usage-keeper.tar.gz -C cpa-usage-keeper --strip-components=1
cd cpa-usage-keeper
```

Copy the `linux_amd64` or `linux_arm64` package URL from Releases, then replace the placeholder in the command above.

#### Configure And Run

```bash
cp .env.example .env
vim .env
./cpa-usage-keeper
```

#### Run With systemd

The Linux binary package includes `cpa-usage-keeper.service`, which can be registered directly as a `systemd` service. After it starts, systemd keeps the process running after SSH or terminal sessions close.

`systemd` requires an absolute `WorkingDirectory`. The `sed` command below writes the current directory into the service file automatically:

```bash
sudo cp cpa-usage-keeper.service /etc/systemd/system/cpa-usage-keeper.service
sudo sed -i "s|__CPA_USAGE_KEEPER_DIR__|$(pwd)|g" /etc/systemd/system/cpa-usage-keeper.service
sudo systemctl daemon-reload
sudo systemctl enable --now cpa-usage-keeper
```

Useful commands:

```bash
sudo systemctl status cpa-usage-keeper
sudo journalctl -u cpa-usage-keeper -f
sudo systemctl restart cpa-usage-keeper
```

## Configuration

Only the following application settings are used:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `APP_DB_PATH` | Yes | - | Path to an existing Keeper SQLite `app.db`; the application opens it read-only |
| `APP_PORT` | No | `8080` | HTTP listen port |
| `APP_BASE_PATH` | No | root path | Subpath prefix, such as `/keeper`; empty means `/` |
| `AUTH_ENABLED` | No | `false` | Whether to enable login protection; recommended for public deployments |
| `LOGIN_PASSWORD` | Yes when auth is enabled | - | Admin login password |
| `AUTH_SESSION_TTL` | No | `168h` | Login session lifetime |

`APP_BASE_PATH` must be empty or start with `/`; for example `/keeper`. `/keeper/` is normalized to `/keeper`.

## Nginx Reverse Proxy

When serving under `/keeper`, set `APP_BASE_PATH=/keeper` and keep the prefix in your reverse proxy:

```nginx
location /keeper/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Project Structure

```text
cmd/server/              Application entrypoint
internal/api/            HTTP routes and read-only dashboard handlers
internal/app/            App wiring and startup
internal/config/         Environment config loading
internal/entities/       GORM data models
internal/helper/         Shared backend helpers and browser-facing redaction
internal/logging/        Logging setup
internal/repository/     Read-only SQLite access and aggregations
internal/service/        Usage and identity query services
internal/timeutil/       Time helpers
internal/version/        Build version metadata
deploy/linux/            Linux systemd service file
web/                     React + TypeScript frontend
```

## Development

### Prerequisites

- Go 1.22+
- Node.js 22+
- npm
- An existing Keeper `app.db`

### Run Locally

1. Create a local config:

```bash
cp .env.example .env
vim .env
```

2. Start the backend:

```bash
go run ./cmd/server/main.go
```

3. In another terminal, install frontend dependencies and start the dev server:

```bash
npm --prefix ./web ci
npm --prefix ./web run dev -- --host 127.0.0.1
```

The frontend dev server proxies `/api` to `http://127.0.0.1:8080` by default. Open `http://127.0.0.1:5173` for local development. If the backend uses another port:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:9090 npm --prefix ./web run dev -- --host 127.0.0.1
```

### Tests

Run the full local verification baseline:

```bash
make verify
```

Or run checks individually:

```bash
go test ./cmd/... ./internal/...
npm --prefix ./web run test
npm --prefix ./web run lint
npm --prefix ./web run typecheck
npm --prefix ./web run build
```

## Star History

<p>
  <img src="https://api.star-history.com/chart?repos=willxup/cpa-usage-keeper&type=date&legend=top-left" />
</p>

## License

This project is open source under the [MIT License](./LICENSE).
