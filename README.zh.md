# CPA Usage Keeper

[English README](./README.md)

`CPA Usage Keeper` 现在是一个只读看板，用于查看已有的 Keeper SQLite 数据库。

给应用提供一个现有 `app.db` 路径后，它会直接从该数据库读取用量概览、分析数据和请求事件。应用不会连接 CPA、不会拉取 Redis 用量队列、不会同步 metadata、不会刷新 quota、不会创建备份，也不会写入数据库。

<p float="left">
  <img src="https://images.bitskyline.com/i/2026/05/govoah.png" width="49%" />
  <img src="https://images.bitskyline.com/i/2026/05/fu4lec.png" width="49%" />
</p>
<p float="left">
  <img src="https://images.bitskyline.com/i/2026/05/fu43px.png" width="49%" />
  <img src="https://images.bitskyline.com/i/2026/05/fu4gh3.png" width="49%" />
</p>

## 功能特性

- 以只读方式打开现有 CPA Usage Keeper `app.db`
- Dashboard 查看请求量、Token、成本、缓存命中率、成功率和延迟
- 支持时间范围和 API Key 筛选
- 分析页展示 Token 趋势、API Key 构成、模型构成和热力图
- 请求事件日志支持模型、来源、结果、分页和时间范围筛选
- 支持通过 `APP_BASE_PATH` 部署到反向代理子路径

## 快速开始

创建 `.env`，把 `APP_DB_PATH` 指向已有数据库：

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

启动服务：

```bash
./cpa-usage-keeper
```

打开 `http://127.0.0.1:8080`。

## 部署方式

### Docker Compose

`docker-compose.example.yml` 是只读看板模板：

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

启动：

```bash
docker compose up -d
```

停止：

```bash
docker compose down
```

挂载的数据库文件必须允许容器用户读取。

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

### Linux 二进制

#### 下载

在 [Releases](https://github.com/Willxup/cpa-usage-keeper/releases/latest) 下载对应架构的 Linux 二进制包，或使用命令行下载：

```bash
curl -L -o cpa-usage-keeper.tar.gz "<替换为 Linux 二进制包下载地址>"
mkdir -p cpa-usage-keeper
tar -xzf cpa-usage-keeper.tar.gz -C cpa-usage-keeper --strip-components=1
cd cpa-usage-keeper
```

请在 Releases 页面复制 `linux_amd64` 或 `linux_arm64` 包的下载地址，并替换上面命令中的占位符。

#### 配置和运行

```bash
cp .env.example .env
vim .env
./cpa-usage-keeper
```

#### systemd 常驻运行

Linux 二进制包内置 `cpa-usage-keeper.service`，可直接注册为 `systemd` 服务。启动后进程由 systemd 托管，关闭 SSH 或终端不会结束进程。

`systemd` 的 `WorkingDirectory` 需要绝对路径。下面的 `sed` 命令会把当前目录自动写入 service 文件：

```bash
sudo cp cpa-usage-keeper.service /etc/systemd/system/cpa-usage-keeper.service
sudo sed -i "s|__CPA_USAGE_KEEPER_DIR__|$(pwd)|g" /etc/systemd/system/cpa-usage-keeper.service
sudo systemctl daemon-reload
sudo systemctl enable --now cpa-usage-keeper
```

常用命令：

```bash
sudo systemctl status cpa-usage-keeper
sudo journalctl -u cpa-usage-keeper -f
sudo systemctl restart cpa-usage-keeper
```

## 配置

应用只使用以下配置：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `APP_DB_PATH` | 是 | - | 现有 Keeper SQLite `app.db` 路径；应用会以只读方式打开 |
| `APP_PORT` | 否 | `8080` | HTTP 监听端口 |
| `APP_BASE_PATH` | 否 | 根路径 | 子路径部署前缀，例如 `/keeper`；留空表示部署在 `/` |
| `AUTH_ENABLED` | 否 | `false` | 是否启用登录保护；公网部署建议设为 `true` |
| `LOGIN_PASSWORD` | 启用登录保护时是 | - | 管理员登录密码 |
| `AUTH_SESSION_TTL` | 否 | `168h` | 登录 session 有效时长 |

`APP_BASE_PATH` 必须为空或以 `/` 开头；例如 `/keeper`，`/keeper/` 会规范为 `/keeper`。

## Nginx 反代

部署到 `/keeper` 时设置 `APP_BASE_PATH=/keeper`，并在反向代理中保留该前缀：

```nginx
location /keeper/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## 项目结构

```text
cmd/server/              应用入口
internal/api/            HTTP 路由与只读看板处理器
internal/app/            应用装配与启动
internal/config/         环境配置加载
internal/entities/       GORM 数据模型
internal/helper/         后端通用辅助方法与前端展示字段脱敏
internal/logging/        日志初始化
internal/repository/     只读 SQLite 访问与聚合查询
internal/service/        usage 与身份数据查询服务
internal/timeutil/       时间工具
internal/version/        构建版本信息
deploy/linux/            Linux systemd 服务文件
web/                     React + TypeScript 前端
```

## 本地开发

### 前置依赖

- Go 1.22+
- Node.js 22+
- npm
- 现有 Keeper `app.db`

### 本地启动

1. 创建本地配置：

```bash
cp .env.example .env
vim .env
```

2. 启动后端：

```bash
go run ./cmd/server/main.go
```

3. 在另一个终端安装前端依赖并启动开发服务器：

```bash
npm --prefix ./web ci
npm --prefix ./web run dev -- --host 127.0.0.1
```

前端开发服务器默认把 `/api` 代理到 `http://127.0.0.1:8080`，访问 `http://127.0.0.1:5173` 即可联调。如果后端使用了其他端口：

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:9090 npm --prefix ./web run dev -- --host 127.0.0.1
```

### 测试

运行完整的本地验证基线：

```bash
make verify
```

也可以单独运行各项检查：

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

本项目基于 [MIT License](./LICENSE) 开源。
