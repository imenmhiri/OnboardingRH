#!/usr/bin/env bash
# Starts a clean local n8n in Docker with the three OnboardingRH workflows
# imported, and W1 published (its webhook is live). W2 and W3 keep their
# schedule unpublished locally: run them from the editor's "Test workflow"
# button (manual trigger) instead of waiting for the daily cron.
#
# Usage (Git Bash or any POSIX shell, app running on port 3000):
#   N8N_WEBHOOK_SECRET=<same value as the app> bash scripts/n8n/start-local.sh
#
# The secret is never written to the repository: the credential file is
# generated in a temporary directory and copied into the container.
set -euo pipefail

SECRET="${N8N_WEBHOOK_SECRET:?Set N8N_WEBHOOK_SECRET to the value the app uses}"
APP_URL="${ONBOARDING_APP_URL:-http://host.docker.internal:3000}"
ENCRYPTION_KEY="${N8N_ENCRYPTION_KEY:-onboarding-local-$(date +%s)}"
NAME="onboarding-n8n"
IMAGE="docker.n8n.io/n8nio/n8n:latest"
DOCKER="${DOCKER:-docker}"

cd "$(dirname "$0")/../.."
# Git Bash would otherwise rewrite container paths such as /tmp/workflows.
export MSYS_NO_PATHCONV=1

"$DOCKER" rm -f "$NAME" >/dev/null 2>&1 || true
"$DOCKER" volume rm "$NAME-data" >/dev/null 2>&1 || true

"$DOCKER" run -d --name "$NAME" -p 5678:5678 \
  -e N8N_ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  -e ONBOARDING_APP_URL="$APP_URL" \
  -e N8N_WEBHOOK_SECRET="$SECRET" \
  -e N8N_BLOCK_ENV_ACCESS_IN_NODE=false \
  -e GENERIC_TIMEZONE=Europe/Paris -e TZ=Europe/Paris \
  -e N8N_SECURE_COOKIE=false \
  -e WEBHOOK_URL=http://localhost:5678/ \
  -v "$NAME-data:/home/node/.n8n" \
  "$IMAGE" >/dev/null

wait_up() {
  for _ in $(seq 1 60); do
    # Captured rather than piped to grep -q: with pipefail, grep closing the
    # pipe early makes curl fail and the check never succeeds.
    code="$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5678/healthz || true)"
    if [ "$code" = "200" ]; then return 0; fi
    sleep 3
  done
  echo "n8n did not start" >&2
  exit 1
}
wait_up

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/credentials.json" <<EOF
[{
  "id": "n8n-webhook-secret",
  "name": "Secret partagé OnboardingRH (N8N_WEBHOOK_SECRET)",
  "type": "httpHeaderAuth",
  "data": { "name": "x-webhook-secret", "value": "$SECRET" }
}]
EOF
# With path conversion disabled, a host path must be converted by hand on Windows.
host_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
"$DOCKER" cp "$(host_path "$tmp/credentials.json")" "$NAME:/tmp/credentials.json"
"$DOCKER" cp workflows "$NAME:/tmp/workflows"

"$DOCKER" exec "$NAME" n8n import:credentials --input=/tmp/credentials.json
"$DOCKER" exec "$NAME" n8n import:workflow --separate --input=/tmp/workflows
"$DOCKER" exec -u root "$NAME" rm -f /tmp/credentials.json

w1_id="$("$DOCKER" exec "$NAME" n8n list:workflow | grep '|W1 ' | cut -d'|' -f1)"
"$DOCKER" exec "$NAME" n8n publish:workflow --id="$w1_id" >/dev/null

"$DOCKER" restart "$NAME" >/dev/null
wait_up
# The health check answers before published webhooks are registered.
for _ in $(seq 1 30); do
  if "$DOCKER" logs --since 2m "$NAME" 2>&1 | grep -q 'Activated workflow "W1'; then break; fi
  sleep 2
done

echo
echo "n8n ready: http://localhost:5678 (create the owner account on first visit)"
echo "W1 webhook: POST http://localhost:5678/webhook/w1-embauche-validee (header x-webhook-secret)"
echo "W2 / W3: open them in the editor and click \"Test workflow\"."
