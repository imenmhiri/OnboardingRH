#!/usr/bin/env bash
# Starts (or reuses) a local n8n in Docker, imports the three OnboardingRH
# workflows and publishes W1 (its webhook is live). W2 and W3 stay
# unpublished locally: run them from the editor's "Test workflow" button.
#
# n8n data (owner account, credentials, execution history) lives in a Docker
# volume that this script never deletes. Re-running it updates the existing
# workflows in place, matched by name, instead of adding copies.
#
# Usage (Git Bash or any POSIX shell, app running on port 3000):
#   N8N_WEBHOOK_SECRET=<same value as the app> bash scripts/n8n/start-local.sh
#
# The secret is never written to the repository: the credential file is
# generated in a temporary directory and copied into the container.
set -euo pipefail

SECRET="${N8N_WEBHOOK_SECRET:?Set N8N_WEBHOOK_SECRET to the value the app uses}"
APP_URL="${ONBOARDING_APP_URL:-http://host.docker.internal:3000}"
NAME="${N8N_CONTAINER:-onboarding-n8n}"
PORT="${N8N_PORT:-5678}"
IMAGE="docker.n8n.io/n8nio/n8n:latest"
DOCKER="${DOCKER:-docker}"

cd "$(dirname "$0")/../.."
# Git Bash would otherwise rewrite container paths such as /tmp/workflows.
export MSYS_NO_PATHCONV=1

state="$("$DOCKER" inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" || state="missing"
if [ "$state" = "missing" ]; then
  # Without N8N_ENCRYPTION_KEY, n8n generates a key on first start and keeps it
  # in the volume, so credentials stay readable across restarts.
  key_args=()
  if [ -n "${N8N_ENCRYPTION_KEY:-}" ]; then key_args=(-e "N8N_ENCRYPTION_KEY=$N8N_ENCRYPTION_KEY"); fi
  "$DOCKER" run -d --name "$NAME" -p "$PORT:5678" \
    ${key_args[@]+"${key_args[@]}"} \
    -e ONBOARDING_APP_URL="$APP_URL" \
    -e N8N_WEBHOOK_SECRET="$SECRET" \
    -e N8N_BLOCK_ENV_ACCESS_IN_NODE=false \
    -e GENERIC_TIMEZONE=Europe/Paris -e TZ=Europe/Paris \
    -e N8N_SECURE_COOKIE=false \
    -e WEBHOOK_URL="http://localhost:$PORT/" \
    -v "$NAME-data:/home/node/.n8n" \
    "$IMAGE" >/dev/null
elif [ "$state" = "false" ]; then
  "$DOCKER" start "$NAME" >/dev/null
fi

wait_up() {
  for _ in $(seq 1 60); do
    # Captured rather than piped to grep -q: with pipefail, grep closing the
    # pipe early makes curl fail and the check never succeeds.
    code="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/healthz" || true)"
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
"$DOCKER" exec -u root "$NAME" rm -rf /tmp/workflows /tmp/credentials.json
"$DOCKER" cp "$(host_path "$tmp/credentials.json")" "$NAME:/tmp/credentials.json"
"$DOCKER" cp workflows "$NAME:/tmp/workflows"

# Give each file the id of the already-imported workflow with the same name,
# so the import updates it instead of creating a duplicate.
"$DOCKER" exec "$NAME" sh -c 'n8n list:workflow > /tmp/workflow-list.txt 2>/dev/null || true'
"$DOCKER" exec -u root "$NAME" node -e '
const fs = require("fs");
const ids = new Map();
for (const line of fs.readFileSync("/tmp/workflow-list.txt", "utf8").split("\n")) {
  const at = line.indexOf("|");
  if (at > 0) ids.set(line.slice(at + 1).trim(), line.slice(0, at).trim());
}
for (const file of fs.readdirSync("/tmp/workflows").filter((f) => f.endsWith(".json"))) {
  const path = "/tmp/workflows/" + file;
  const workflow = JSON.parse(fs.readFileSync(path, "utf8"));
  const id = ids.get(workflow.name);
  if (id) workflow.id = id;
  fs.writeFileSync(path, JSON.stringify(workflow));
  console.log((id ? "update " : "create ") + workflow.name);
}'

"$DOCKER" exec "$NAME" n8n import:credentials --input=/tmp/credentials.json
"$DOCKER" exec "$NAME" n8n import:workflow --separate --input=/tmp/workflows
"$DOCKER" exec -u root "$NAME" rm -rf /tmp/credentials.json /tmp/workflows /tmp/workflow-list.txt

w1_id="$("$DOCKER" exec "$NAME" n8n list:workflow | grep '|W1 ' | head -1 | cut -d'|' -f1)"
"$DOCKER" exec "$NAME" n8n publish:workflow --id="$w1_id" >/dev/null

# Publishing only takes effect after a restart; the volume (and the account) stays.
"$DOCKER" restart "$NAME" >/dev/null
wait_up
# The health check answers before published webhooks are registered.
for _ in $(seq 1 30); do
  if "$DOCKER" logs --since 2m "$NAME" 2>&1 | grep -q 'Activated workflow "W1'; then break; fi
  sleep 2
done

echo
echo "n8n ready: http://localhost:$PORT (existing account kept; create one only on a brand-new install)"
echo "W1 webhook: POST http://localhost:$PORT/webhook/w1-embauche-validee (header x-webhook-secret)"
echo "W2 / W3: open them in the editor and click \"Test workflow\"."
