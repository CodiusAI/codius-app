<p align="center">
  <img src="https://codius.ai/images/logo-mark-light.svg" width="64" height="64" alt="Codius logo">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/CodiusAI/codius-app/stargazers">
    <img src="https://img.shields.io/github/stars/CodiusAI/codius-app?style=flat&logo=github" alt="GitHub stars">
  </a>
  <a href="https://github.com/CodiusAI/codius-app/releases">
    <img src="https://img.shields.io/github/v/release/CodiusAI/codius-app?style=flat&logo=github" alt="GitHub release">
  </a>
  <a href="https://discord.gg/kV46cvQFX">
    <img src="https://img.shields.io/badge/Discord-555?logo=discord" alt="Discord">
  </a>
  <a href="https://www.reddit.com/r/CodiusAI/">
    <img src="https://img.shields.io/badge/Reddit-555?logo=reddit" alt="Reddit">
  </a>
</p>

<p align="center">Claude Code、Codex、Copilot、OpenCode 和 Pi agents 的统一界面。</p>

<p align="center">
  <img src="https://codius.ai/images/product/codius-app-desktop.png" alt="显示已清理演示仓库的真实 Codius App 桌面界面" width="100%">
</p>

<p align="center">
  <a href="https://codius.ai/app">查看 Codius App 的桌面、网页和移动端产品界面</a>
</p>

> [!NOTE]
> 我是独立维护者，不一定每天都能及时处理 GitHub Issues。
> 如果问题很紧急或阻塞了你，[Discord](https://discord.gg/kV46cvQFX) 是最快联系到我的地方。

---

在你自己的机器上并行运行 agents。无论在手机上还是桌前，都能推进交付。

- **自托管：** Agents 在你的机器上运行，使用完整的本地开发环境、工具、配置和技能。
- **多提供商：** 通过同一个界面使用 Claude Code、Codex、Copilot、OpenCode 和 Pi。为每个任务选择合适的模型。
- **语音控制：** 在语音模式下口述任务或讨论问题。需要免手操作时很方便。
- **跨设备：** 支持 iOS、Android、桌面端、Web 和 Codius CLI。在桌前开始工作，用手机查看进度，也可以从终端脚本化操作。
- **隐私优先：** Codius 没有遥测、追踪，也不会强制登录。

## 快速开始

Codius 会运行一个名为 daemon 的本地服务，用来管理你的 coding agents。桌面 app、移动 app、Web app 和 Codius CLI 都会连接到它。

### 前置条件

你至少需要安装一个 agent CLI，并用你的凭据完成配置：

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://github.com/openai/codex)
- [GitHub Copilot](https://github.com/features/copilot/cli/)
- [OpenCode](https://github.com/anomalyco/opencode)
- [Pi](https://pi.dev)

### 桌面 app（推荐）

从 [codius.ai/download](https://codius.ai/download) 或 [GitHub releases 页面](https://github.com/CodiusAI/codius-app/releases)下载。打开 app 后 daemon 会自动启动，不需要再安装其他东西。

如果要从手机连接，在 Settings 中扫描显示的二维码。

### Codius CLI / 无头模式

在服务器或远程机器上，可以通过 Codius CLI 的 `codius` 命令管理主机和 agents。设置方法请参阅 [Codius CLI 文档](https://codius.ai/docs/cli)。

## Codius CLI

你可以从终端管理主机和 agents。

```bash
codius run --provider claude "implement user authentication"
codius run --provider codex --worktree feature-x "implement feature X"

codius ls                           # 列出正在运行的 agents
codius attach abc123                # 实时流式查看输出
codius send abc123 "also add tests" # 发送后续任务

# 在远程 daemon 上运行
codius --host workstation.local:6767 run "run the full test suite"
```

更多内容见 [Codius CLI 参考](https://codius.ai/docs/cli)。

## Skills

Skills 会教你的 agent 使用 Codius 来编排其他 agents。

```bash
npx skills add CodiusAI/codius-app
```

然后在任意 agent 对话中使用：

- `/codius-handoff` — 在 agents 之间交接工作。我会用它先和 Claude 规划，再交给 Codex 实现。
- `/codius-loop` — 让 agent 按明确验收标准循环工作（也叫 Ralph loops），也可以加 verifier。
- `/codius-advisor` — 启动单个 agent 作为 advisor，提供第二意见，但不把工作委托出去。
- `/codius-committee` — 组建两个风格互补的 agents，让它们后退一步做根因分析并产出计划。

## 开发

Monorepo 包结构速览：

- `packages/server`：Codius daemon（agent 进程编排、WebSocket API、MCP server）
- `packages/app`：Expo 客户端（iOS、Android、Web）
- `packages/cli`：用于 daemon 和 agent 工作流的 Codius CLI (`codius`)
- `packages/desktop`：Electron 桌面 app
- `packages/relay`：用于远程连接的 relay 包

常用命令：

```bash
# 运行所有本地开发服务
npm run dev

# 单独运行某个界面
npm run dev:server
npm run dev:app
npm run dev:desktop

# 构建 server stack
npm run build:server

# 全仓库检查
npm run typecheck
```

## 相关项目

- [codius-relay](https://github.com/zenghongtu/codius-relay) — Go 实现的自托管 relay
- [codius-vscode](https://marketplace.visualstudio.com/items?itemName=hinnes.codius-vscode) — VS Code 扩展

### 自托管 relay TLS

自托管 relay 默认使用 `ws://`，除非显式启用 TLS。对于 nginx 后面、监听 443 的 relay，可以这样启动 daemon：

```bash
CODIUS_RELAY_ENDPOINT=127.0.0.1:8080 \
CODIUS_RELAY_PUBLIC_ENDPOINT=relay.example.com:443 \
CODIUS_RELAY_USE_TLS=true \
codius daemon start
```

等价配置：

```json
{
  "daemon": {
    "relay": {
      "enabled": true,
      "endpoint": "127.0.0.1:8080",
      "publicEndpoint": "relay.example.com:443",
      "useTls": true
    }
  }
}
```

最小 nginx WebSocket 代理配置：

```nginx
server {
  listen 443 ssl;
  server_name relay.example.com;

  ssl_certificate /etc/letsencrypt/live/relay.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;

  location /ws {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

---

<p align="center">
  <a href="https://star-history.com/#CodiusAI/codius-app&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=CodiusAI/codius-app&type=Date&theme=dark">
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=CodiusAI/codius-app&type=Date">
      <img src="https://api.star-history.com/svg?repos=CodiusAI/codius-app&type=Date" alt="Star history chart for CodiusAI/codius-app" width="600" style="max-width: 100%;">
    </picture>
  </a>
</p>

## License

AGPL-3.0
