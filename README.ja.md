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

<p align="center">Claude Code、Codex、Copilot、OpenCode、Pi のエージェントを、ひとつのインターフェースで。</p>

<p align="center">
  <img src="https://codius.ai/images/product/codius-app-desktop.png" alt="サニタイズされたデモリポジトリを表示する実際の Codius App デスクトップ画面" width="100%">
</p>

<p align="center">
  <a href="https://codius.ai/app">Codius App のデスクトップ、Web、モバイル製品画面を見る</a>
</p>

> [!NOTE]
> 私はひとりでメンテナンスしているため、GitHub Issues を毎日確認できるとは限りません。
> 急ぎの問題や作業がブロックされている場合は、[Discord](https://discord.gg/kV46cvQFX) から連絡するのが一番早いです。

---

自分のマシンでエージェントを並列実行。スマートフォンからでもデスクからでも、開発を進めてリリースできます。

- **セルフホスト:** エージェントはあなたのマシン上で動作し、完全な開発環境を使用します。自分のツール・設定・スキルをそのまま活用できます。
- **マルチプロバイダー:** Claude Code、Codex、Copilot、OpenCode、Pi を同一のインターフェースで利用。タスクに合ったモデルを選べます。
- **音声コントロール:** 音声モードでタスクを口述したり問題を話し合ったりできます。ハンズフリーが必要なときに便利です。
- **クロスデバイス:** iOS、Android、デスクトップ、Web、Codius CLI に対応。机で作業を始め、スマートフォンで確認し、ターミナルから自動化できます。
- **プライバシー優先:** Codius にはテレメトリー・トラッキング・強制ログインは一切ありません。

## はじめかた

Codius はコーディングエージェントを管理するローカルサーバー（デーモン）を起動します。デスクトップアプリ・モバイルアプリ・Web アプリ・Codius CLI がこのデーモンに接続します。

### 前提条件

エージェント CLI をひとつ以上インストールし、認証情報を設定しておく必要があります。

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://github.com/openai/codex)
- [GitHub Copilot](https://github.com/features/copilot/cli/)
- [OpenCode](https://github.com/anomalyco/opencode)
- [Pi](https://pi.dev)

### デスクトップアプリ（推奨）

[codius.ai/download](https://codius.ai/download) または [GitHub のリリースページ](https://github.com/CodiusAI/codius-app/releases)からダウンロードしてください。アプリを開くとデーモンが自動的に起動します。追加のインストールは不要です。

スマートフォンから接続するには、Settings 画面に表示される QR コードをスキャンしてください。

### Codius CLI / ヘッドレス

サーバーやリモートマシンでは、Codius CLI の `codius` コマンドからホストとエージェントを管理できます。セットアップは [Codius CLI ドキュメント](https://codius.ai/docs/cli)を参照してください。

## Codius CLI

ターミナルからホストとエージェントを管理できます。

```bash
codius run --provider claude "implement user authentication"
codius run --provider codex --worktree feature-x "implement feature X"

codius ls                           # 実行中のエージェントを一覧表示
codius attach abc123                # ライブ出力をストリーミング
codius send abc123 "also add tests" # 追加タスクを送信

# リモートデーモンで実行
codius --host workstation.local:6767 run "run the full test suite"
```

詳細は[Codius CLI リファレンス](https://codius.ai/docs/cli)を参照してください。

## スキル

スキルはエージェントに Codius を使って他のエージェントをオーケストレーションする方法を教えます。

```bash
npx skills add CodiusAI/codius-app
```

どのエージェントとの会話でも使用できます。

- `/codius-handoff` — エージェント間で作業を引き継ぎます。私はこれを使って Claude で計画し、Codex に実装を引き継いでいます。
- `/codius-loop` — 明確な受け入れ基準に沿ってエージェントをループさせます（Ralph loops とも呼ばれます）。検証役を追加することもできます。
- `/codius-advisor` — 単一のエージェントをアドバイザーとして起動し、作業を委任せずにセカンドオピニオンを得ます。
- `/codius-committee` — 対照的な2つのエージェントで委員会を構成し、一歩引いた視点で根本原因を分析して計画を作成します。

## 開発

モノレポのパッケージ構成：

- `packages/server`: Codius デーモン（エージェントプロセスのオーケストレーション、WebSocket API、MCP サーバー）
- `packages/app`: Expo クライアント（iOS、Android、Web）
- `packages/cli`: デーモンおよびエージェントワークフロー向け Codius CLI (`codius`)
- `packages/desktop`: Electron デスクトップアプリ
- `packages/relay`: リモート接続用リレーパッケージ

よく使うコマンド：

```bash
# すべてのローカル開発サービスを起動
npm run dev

# 個別のサービスを起動
npm run dev:server
npm run dev:app
npm run dev:desktop

# サーバースタックをビルド
npm run build:server

# リポジトリ全体のチェック
npm run typecheck
```

## 関連プロジェクト

- [codius-relay](https://github.com/zenghongtu/codius-relay) — Go 実装のセルフホスト型リレー
- [codius-vscode](https://marketplace.visualstudio.com/items?itemName=hinnes.codius-vscode) — VS Code 拡張機能

---

<p align="center">
  <a href="https://star-history.com/#CodiusAI/codius-app&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=CodiusAI/codius-app&type=Date&theme=dark">
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=CodiusAI/codius-app&type=Date">
      <img src="https://api.star-history.com/svg?repos=CodiusAI/codius-app&type=Date" alt="CodiusAI/codius-app のスター履歴チャート" width="600" style="max-width: 100%;">
    </picture>
  </a>
</p>

## ライセンス

AGPL-3.0
