# llmapi_dashboard

> This project is modified from [Willxup/cpa-usage-keeper](https://github.com/Willxup/cpa-usage-keeper).

[中文说明](./README.zh.md)

`llmapi_dashboard` is a read-only dashboard for an existing SQLite `app.db`. It shows LLM API usage overview, analysis charts, request events, credential statistics, model information, and balance query results.

The application opens the database read-only and runs configured read-only query commands.

## Features

- Usage overview for requests, success/failure count, tokens, RPM/TPM, cost, and service health.
- Analysis view for token trends, API key composition, cost composition, model composition, credential composition, and heatmaps.
- Request event log with time range, API key, model, source, result filters, and pagination.
- Credential dashboard for account metadata and usage statistics.
- Model page for available models and database pricing.
- OhMyGPT API key lookup form configured by `OHMYGPT_QUERY_URL` and `OHMYGPT_QUERY_TOKEN`.
- Header balance display for daily refresh balance and pay-as-you-go balance.
- Deployment support for login protection, reverse-proxy subpaths, local Docker builds, Linux binaries, and systemd.

## Quick Start

```bash
cp .env.example .env
vim .env
```

Minimum config:

```env
APP_DB_PATH=/absolute/path/to/app.db
APP_PORT=8080
APP_BASE_PATH=
AUTH_ENABLED=false
LOGIN_PASSWORD=replace-with-your-login-password
AUTH_SESSION_TTL=168h
```

Run:

```bash
./llmapi-dashboard
```

Open:

```text
http://127.0.0.1:8080
```

## Docker

Build the local image from this repository:

```bash
docker build -t llmapi-dashboard:local .
```

Run:

```bash
docker run -d \
  --name llmapi-dashboard \
  -p 8080:8080 \
  -e APP_DB_PATH=/data/app.db \
  -e APP_PORT=8080 \
  -e AUTH_ENABLED=false \
  -v "$(pwd)/data/app.db:/data/app.db:ro" \
  llmapi-dashboard:local
```

## Linux And systemd

```bash
cp .env.example .env
vim .env
./llmapi-dashboard
```

```bash
sudo cp deploy/linux/llmapi-dashboard.service /etc/systemd/system/llmapi-dashboard.service
sudo sed -i "s|__LLMAPI_DASHBOARD_DIR__|$(pwd)|g" /etc/systemd/system/llmapi-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable --now llmapi-dashboard
```

## Build Ubuntu Artifacts

Ubuntu 20.04:

```bash
docker buildx build \
  --file Dockerfile.ubuntu20.04 \
  --target artifact \
  --platform linux/amd64 \
  --build-arg TARGETOS=linux \
  --build-arg TARGETARCH=amd64 \
  --output type=local,dest=build/ubuntu-20.04 \
  .
```

Ubuntu 24.04:

```bash
docker buildx build \
  --file Dockerfile.ubuntu24.04 \
  --target artifact \
  --platform linux/amd64 \
  --build-arg TARGETOS=linux \
  --build-arg TARGETARCH=amd64 \
  --output type=local,dest=build/ubuntu-24.04 \
  .
```

Output:

```text
llmapi-dashboard-linux-amd64
```

## Configuration

See [.env.example](./.env.example) and [README.zh.md](./README.zh.md) for the full configuration reference.

OhMyGPT lookup uses:

```env
OHMYGPT_QUERY_URL=https://example.com/api/v1/user/admin/get-api-tokens
OHMYGPT_QUERY_TOKEN=replace-with-private-query-token
```

The backend calls the configured URL with `POST` and `Authorization: Bearer ...`, then filters the returned list by the full API key entered in the model-info page.

## Header Balance Command

Copy the ignored private script:

```bash
cp query_amount.example.py query_amount.py
vim query_amount.py
```

Set:

```env
DAILY_QUOTA_QUERY_COMMAND=uv run query_amount.py
DAILY_QUOTA_CACHE_TTL=10m
```

The command must print exactly one JSON object with `daily_refresh` and `pay_as_you_go` objects. See [README.zh.md](./README.zh.md) for the full format.

## Development

```bash
go run ./cmd/server/main.go
npm --prefix ./web ci
npm --prefix ./web run dev -- --host 127.0.0.1
```

## Tests

```bash
go test ./cmd/... ./internal/...
npm --prefix ./web run test
npm --prefix ./web run lint
npm --prefix ./web run typecheck
npm --prefix ./web run build
uv run --no-project query_amount.example.py
```

Go database tests require CGO because SQLite uses `github.com/mattn/go-sqlite3`.

## License

This project uses the [MIT License](./LICENSE).
