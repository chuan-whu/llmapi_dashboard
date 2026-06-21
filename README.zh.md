# llmapi_dashboard

> 本项目基于 [Willxup/cpa-usage-keeper](https://github.com/Willxup/cpa-usage-keeper) 魔改。

[English README](./README.md)

`llmapi_dashboard` 是一个面向 LLM API 使用情况的只读数据看板。它读取已有的 SQLite `app.db`，展示用量、分析、请求事件、凭证统计、模型信息和余额查询结果。

应用以只读方式打开数据库，并按配置执行少量只读查询。

## 功能

- 用量总览：请求量、成功/失败数、Token、缓存 Token、推理 Token、RPM/TPM、成本和服务健康。
- 分析视图：Token 趋势、API Key 构成、成本构成、模型构成、凭证构成和热力图。
- 请求事件：按时间范围、API Key、模型、来源、结果筛选并分页查看请求明细。
- 凭证看板：查看凭证来源、请求统计、最后使用时间、启用状态和元数据。
- 模型信息：读取可用模型列表，并展示数据库中的模型价格表。
- 模型查询：通过 `OHMYGPT_QUERY_URL` 和 `OHMYGPT_QUERY_TOKEN` 查询 OhMyGPT API Key 额度与可用模型。
- 顶部余额：通过本地命令显示“每日刷新余额”和“按量计费余额”。
- 部署能力：支持登录保护、反向代理子路径、Docker 本地构建、Linux 二进制和 systemd。

## 数据边界

必须提供一个已有数据库：

```env
APP_DB_PATH=/absolute/path/to/app.db
```

当前应用只读打开该数据库。如果 `app.db` 缺少所需表，应用会启动失败或页面查询失败。

## 快速开始

```bash
cp .env.example .env
vim .env
```

最小配置：

```env
APP_DB_PATH=/absolute/path/to/app.db
APP_PORT=8080
APP_BASE_PATH=
AUTH_ENABLED=false
LOGIN_PASSWORD=replace-with-your-login-password
AUTH_SESSION_TTL=168h
```

运行：

```bash
./llmapi-dashboard
```

访问：

```text
http://127.0.0.1:8080
```

如果通过子路径部署，例如 `/usage`：

```env
APP_BASE_PATH=/usage
```

## Docker 部署

本项目需要从当前仓库本地构建镜像：

```bash
docker build -t llmapi-dashboard:local .
```

运行：

```bash
docker run -d \
  --name llmapi-dashboard \
  -p 8080:8080 \
  -e APP_DB_PATH=/data/app.db \
  -e APP_PORT=8080 \
  -e APP_BASE_PATH= \
  -e AUTH_ENABLED=false \
  -v "$(pwd)/data/app.db:/data/app.db:ro" \
  llmapi-dashboard:local
```

挂载的数据库文件必须允许容器用户读取。

## Linux 二进制与 systemd

准备配置后直接运行：

```bash
cp .env.example .env
vim .env
./llmapi-dashboard
```

注册为 systemd 服务：

```bash
sudo cp deploy/linux/llmapi-dashboard.service /etc/systemd/system/llmapi-dashboard.service
sudo sed -i "s|__LLMAPI_DASHBOARD_DIR__|$(pwd)|g" /etc/systemd/system/llmapi-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable --now llmapi-dashboard
```

常用命令：

```bash
sudo systemctl status llmapi-dashboard
sudo journalctl -u llmapi-dashboard -f
sudo systemctl restart llmapi-dashboard
```

## 构建 Ubuntu 产物

仓库提供两个 Dockerfile：

- `Dockerfile.ubuntu20.04`
- `Dockerfile.ubuntu24.04`

构建 Ubuntu 20.04 amd64 二进制：

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

构建 Ubuntu 24.04 amd64 二进制：

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

输出文件名：

```text
llmapi-dashboard-linux-amd64
```

## 配置

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `APP_DB_PATH` | 是 | - | 已有 SQLite `app.db` 路径，应用只读打开 |
| `APP_PORT` | 否 | `8080` | HTTP 监听端口 |
| `APP_BASE_PATH` | 否 | 根路径 | 子路径部署前缀，例如 `/usage` |
| `AUTH_ENABLED` | 否 | `false` | 是否启用登录保护，公网部署建议开启 |
| `LOGIN_PASSWORD` | 启用登录保护时是 | - | 登录密码 |
| `AUTH_SESSION_TTL` | 否 | `168h` | 登录 session 有效时长 |
| `TUTORIAL_PDF_PATH` | 否 | 空 | 顶部教程 PDF 路径，留空则隐藏 |
| `AVAILABLE_MODELS_BASE_URL` | 否 | 空 | OpenAI 兼容模型接口地址，可为域名、`/v1` 或 `/v1/models` |
| `AVAILABLE_MODELS_API_KEY` | 否 | 空 | 查询可用模型列表使用的 API Key |
| `OHMYGPT_QUERY_URL` | 否 | 空 | 模型与查询页底部 OhMyGPT 查询框调用的后端接口 |
| `OHMYGPT_QUERY_TOKEN` | 否 | 空 | 调用 `OHMYGPT_QUERY_URL` 使用的 Bearer token |
| `DAILY_QUOTA_QUERY_COMMAND` | 否 | 空 | 顶部余额查询命令，stdout 必须是指定 JSON |
| `DAILY_QUOTA_CACHE_TTL` | 否 | `10m` | 顶部余额查询结果缓存时间 |

说明：

- `APP_BASE_PATH` 必须为空或以 `/` 开头，`/usage/` 会规范为 `/usage`。
- 相对路径的 `APP_DB_PATH`、`TUTORIAL_PDF_PATH` 会按 `.env` 所在目录解析。
- `AVAILABLE_MODELS_BASE_URL` 或 `AVAILABLE_MODELS_API_KEY` 任一为空时，可用模型列表为空。
- `OHMYGPT_QUERY_URL` 或 `OHMYGPT_QUERY_TOKEN` 任一为空时，模型与查询页底部查询框会返回配置缺失错误。
- OhMyGPT 查询框会把页面输入的完整 API Key 传给后端，后端调用 `OHMYGPT_QUERY_URL` 后只保留完整 key 匹配的记录，不按后三位匹配。

## OhMyGPT 查询框

配置：

```env
OHMYGPT_QUERY_URL=https://example.com/api/v1/user/admin/get-api-tokens
OHMYGPT_QUERY_TOKEN=replace-with-private-query-token
```

页面路径：

```text
模型与查询 -> Oh My GPT额度与可用模型查询
```

后端请求行为：

- dashboard 后端向 `OHMYGPT_QUERY_URL` 发起 `POST` 请求。
- 请求头包含 `Authorization: Bearer ${OHMYGPT_QUERY_TOKEN}`。
- 页面输入的 API Key 不会发给 OhMyGPT 接口，而是在后端拿到返回列表后做完整 key 过滤。
- 查询结果会在页面展示剩余额度、剩余额度比例、已用额度、总额度、调用次数、有效期和可用模型。

## 顶部余额查询

推荐做法：

```bash
cp query_amount.example.py query_amount.py
vim query_amount.py
```

`query_amount.py` 已被 `.gitignore` 忽略，真实密钥、私有接口、代理配置只放在这个文件里。

配置命令：

```env
DAILY_QUOTA_QUERY_COMMAND=uv run query_amount.py
DAILY_QUOTA_CACHE_TTL=10m
```

命令 stdout 必须只包含一个 JSON 对象：

```json
{
  "status": "ok",
  "daily_refresh": {
    "status": "ok",
    "remaining": 12.34
  },
  "pay_as_you_go": {
    "status": "ok",
    "remaining": 56.78
  }
}
```

规则：

- 顶层 `status` 允许 `ok`、`partial`、`failed`。
- `daily_refresh` 和 `pay_as_you_go` 必须存在。
- 子对象 `status` 允许 `ok`、`partial`、`failed`。
- 子对象为 `ok` 或 `partial` 时，`remaining` 必须是数字。
- stdout 不能混入日志、warning 或多个 JSON 对象。
- 负数余额会按脚本逻辑归零。
- 后端展示时保留两位小数。

排查要点：

- 后端命令默认超时为 30 秒。
- 失败结果也会按 `DAILY_QUOTA_CACHE_TTL` 缓存。
- systemd/Docker 下的 `PATH`、`HOME`、工作目录可能和 SSH 手动执行不同。
- 开启登录保护后，直接 curl `/api/v1/daily-quota` 会返回认证错误，需要带登录 cookie 或临时关闭认证排查。

## Nginx 反向代理

部署到 `/usage`：

```env
APP_BASE_PATH=/usage
```

Nginx 示例：

```nginx
location /usage/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## 本地开发

前置依赖：

- Go 1.22+
- Node.js 22+
- npm
- uv
- 已有 `app.db`

启动后端：

```bash
go run ./cmd/server/main.go
```

启动前端开发服务器：

```bash
npm --prefix ./web ci
npm --prefix ./web run dev -- --host 127.0.0.1
```

默认代理到 `http://127.0.0.1:8080`。如果后端端口不同：

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:9090 npm --prefix ./web run dev -- --host 127.0.0.1
```

## 测试

```bash
go test ./cmd/... ./internal/...
npm --prefix ./web run test
npm --prefix ./web run lint
npm --prefix ./web run typecheck
npm --prefix ./web run build
uv run --no-project query_amount.example.py
```

SQLite 使用 `github.com/mattn/go-sqlite3`，运行 Go 数据库测试需要启用 CGO 并安装可用 C 编译器。

## 项目结构

```text
cmd/server/              后端入口
internal/api/            HTTP 路由
internal/app/            应用装配
internal/config/         环境配置
internal/entities/       数据模型
internal/helper/         后端辅助函数
internal/logging/        日志配置
internal/repository/     SQLite 查询与聚合
internal/service/        业务查询服务
internal/timeutil/       时间处理
internal/version/        构建版本
deploy/linux/            systemd 服务文件
web/                     React + TypeScript 前端
query_amount.example.py  顶部余额查询示例脚本
```

## 安全注意

- 不要提交 `.env`、`query_amount.py`、数据库文件或构建产物。
- 真实 API Key、Bearer token、代理地址只放在部署环境或 ignored 私有文件中。
- 公网部署建议启用 `AUTH_ENABLED=true` 并设置强密码。

## License

本项目使用 [MIT License](./LICENSE)。
