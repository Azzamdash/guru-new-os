#!/usr/bin/env bash
# Server-side deploy script for e-Gurus OS.
# Install on the droplet as /usr/local/bin/deploy-guru-recall (chmod 755).
#
# Usage: deploy-guru-recall <git-sha>
#
# Strategy: build a new release directory, smoke test it on a scratch port,
# and only then flip the "current" symlink and restart systemd. If anything
# fails, the running release is left untouched.

set -euo pipefail

SHA="${1:?usage: deploy-guru-recall <git-sha>}"
APP_DIR="${APP_DIR:-/srv/egurus-os}"
REPO_URL="${REPO_URL:-https://github.com/Azzamdash/guru-recall-os-e542460d.git}"
SERVICE="${SERVICE:-egurus-os}"
ENV_FILE="${ENV_FILE:-/etc/egurus-os.env}"
PORT="${PORT:-3000}"
SMOKE_PORT="${SMOKE_PORT:-3999}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

test -f "$ENV_FILE" || { log "missing env file $ENV_FILE"; exit 1; }

mkdir -p "$APP_DIR/releases" "$APP_DIR/repo"

# 1) Fetch the exact commit.
if [ ! -d "$APP_DIR/repo/.git" ]; then
  git clone --no-checkout "$REPO_URL" "$APP_DIR/repo"
fi
git -C "$APP_DIR/repo" fetch --depth 1 origin "$SHA"

RELEASE="$APP_DIR/releases/$SHA-$(date -u +%Y%m%d%H%M%S)"
mkdir -p "$RELEASE"
git -C "$APP_DIR/repo" archive "$SHA" | tar -x -C "$RELEASE"
log "checked out $SHA -> $RELEASE"

# 2) Build with the same env the app runs with.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

cd "$RELEASE"
bun install --frozen-lockfile
NITRO_PRESET=node-server bun run build
test -f "$RELEASE/.output/server/index.mjs"
log "build ok"

# 3) Smoke test the new release on a scratch port BEFORE touching systemd.
PORT="$SMOKE_PORT" node "$RELEASE/.output/server/index.mjs" &
SMOKE_PID=$!
smoke_ok=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$SMOKE_PORT/"; then smoke_ok=1; break; fi
  sleep 2
done
kill "$SMOKE_PID" 2>/dev/null || true
wait "$SMOKE_PID" 2>/dev/null || true
if [ "$smoke_ok" -ne 1 ]; then
  log "smoke test FAILED — keeping current release, nothing restarted"
  rm -rf "$RELEASE"
  exit 1
fi
log "smoke test ok"

# 4) Flip symlink + restart systemd, with rollback on failure.
PREVIOUS="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
ln -sfn "$RELEASE" "$APP_DIR/current.new"
mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"

if ! systemctl restart "$SERVICE"; then
  log "systemd restart failed — rolling back"
  [ -n "$PREVIOUS" ] && ln -sfn "$PREVIOUS" "$APP_DIR/current" && systemctl restart "$SERVICE" || true
  exit 1
fi

health_ok=0
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then health_ok=1; break; fi
  sleep 3
done

if [ "$health_ok" -ne 1 ]; then
  log "post-restart health check FAILED — rolling back"
  if [ -n "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$APP_DIR/current"
    systemctl restart "$SERVICE"
  fi
  exit 1
fi

log "deployed $SHA successfully"

# 5) Prune old releases.
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | xargs -r rm -rf
