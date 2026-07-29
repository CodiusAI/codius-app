# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-bookworm-slim
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS source-pack

ARG CODIUS_VERSION

ENV ONNXRUNTIME_NODE_INSTALL=skip

WORKDIR /tmp/codius-src
COPY . .

RUN set -eux; \
    if [ -n "${CODIUS_VERSION:-}" ]; then \
      test "$(node -p "require('./package.json').version")" = "${CODIUS_VERSION}"; \
    fi; \
    node -e 'const fs=require("node:fs"); const pkg=JSON.parse(fs.readFileSync("package.json","utf8")); delete pkg.scripts.prepare; fs.writeFileSync("package.json", `${JSON.stringify(pkg)}\n`);'; \
    npm ci

RUN set -eux; \
    mkdir -p /tmp/codius-packs; \
    npm pack --workspace=@codius.ai/highlight --pack-destination /tmp/codius-packs; \
    npm pack --workspace=@codius.ai/relay --pack-destination /tmp/codius-packs; \
    npm pack --workspace=@codius.ai/protocol --pack-destination /tmp/codius-packs; \
    npm pack --workspace=@codius.ai/client --pack-destination /tmp/codius-packs; \
    npm pack --workspace=@codius.ai/server --pack-destination /tmp/codius-packs; \
    npm pack --workspace=@codius.ai/cli --pack-destination /tmp/codius-packs

FROM ${NODE_IMAGE}

ENV HOME=/home/codius \
    CODIUS_HOME=/home/codius/.codius \
    CODIUS_LISTEN=0.0.0.0:6767 \
    CODIUS_WEB_UI_ENABLED=true \
    CODIUS_LOG_FORMAT=json \
    CODIUS_LOG_LEVEL=info \
    CLAUDE_CONFIG_DIR=/home/codius/.claude \
    CODEX_HOME=/home/codius/.codex \
    XDG_CONFIG_HOME=/home/codius/.config \
    XDG_DATA_HOME=/home/codius/.local/share \
    XDG_STATE_HOME=/home/codius/.local/state \
    XDG_CACHE_HOME=/home/codius/.cache \
    ONNXRUNTIME_NODE_INSTALL=skip

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      git \
      gosu \
      lbzip2 \
      openssh-client \
      procps \
      tini; \
    rm -rf /var/lib/apt/lists/*

COPY --from=source-pack /tmp/codius-packs /tmp/codius-packs
RUN set -eux; \
	npm install -g /tmp/codius-packs/*.tgz; \
    rm -rf /tmp/codius-packs; \
    npm cache clean --force; \
    server_entry="$(npm root -g)/@codius.ai/server/dist/scripts/supervisor-entrypoint.js"; \
    test -f "$server_entry"; \
    printf '%s\n' "$server_entry" > /etc/codius-server-entry; \
    node --check "$server_entry"

RUN set -eux; \
    existing_group="$(getent group 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing_group" ] && [ "$existing_group" != "codius" ]; then \
      groupmod --new-name codius "$existing_group"; \
    elif [ -z "$existing_group" ]; then \
      groupadd --gid 1000 codius; \
    fi; \
    existing_user="$(getent passwd 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing_user" ] && [ "$existing_user" != "codius" ]; then \
      usermod --login codius --gid codius --home /home/codius --shell /bin/bash "$existing_user"; \
    elif [ -z "$existing_user" ]; then \
      useradd --uid 1000 --gid codius --create-home --home-dir /home/codius --shell /bin/bash codius; \
    fi; \
    mkdir -p \
      /workspace \
      "$CODIUS_HOME" \
      "$CLAUDE_CONFIG_DIR" \
      "$CODEX_HOME" \
      "$XDG_CONFIG_HOME" \
      "$XDG_DATA_HOME" \
      "$XDG_STATE_HOME" \
      "$XDG_CACHE_HOME"; \
    chown -R codius:codius /home/codius /workspace

COPY docker/base/rootfs/ /
RUN chmod +x /usr/local/bin/codius-docker-entrypoint

WORKDIR /workspace

EXPOSE 6767
VOLUME ["/home/codius"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const listen=process.env.CODIUS_LISTEN||'0.0.0.0:6767'; const m=listen.match(/:(\\d+)$/); const port=m?Number(m[1]):6767; require('http').get({hostname:'127.0.0.1',port,path:'/api/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/codius-docker-entrypoint"]
