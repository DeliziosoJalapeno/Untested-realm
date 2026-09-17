#!/usr/bin/env bash
# Announce a site-wide restart to all players, wait N minutes, then recreate the
# container on the latest image.
#
#   ./restart-with-notice.sh <minutes>
#
# The banner ("Server restarts in Nm Ss — all ongoing battles will end", with an ✕ to
# dismiss) shows at the top-centre of every page for everyone until the deadline.
set -euo pipefail

MIN="${1:-}"
if [[ -z "$MIN" || ! "$MIN" =~ ^[0-9]+$ || "$MIN" -lt 1 ]]; then
  echo "Usage: $0 <minutes>   (whole minutes, >= 1)" >&2
  exit 1
fi

CONTAINER="untestedrealm"
IMAGE="rfratello/untestedrealm:latest"

echo "→ Announcing restart in ${MIN} minute(s) to all players…"
# node:alpine has no curl, but Node ships a global fetch. Run it INSIDE the container so
# the request comes from loopback and passes the server's local-only guard.
docker exec "$CONTAINER" node -e "fetch('http://127.0.0.1:8787/api/announce',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({minutes:${MIN}})}).then(r=>r.text()).then(t=>console.log('  server:',t)).catch(e=>{console.error(e);process.exit(1)})"

echo "→ Waiting ${MIN} minute(s) before restart…"
sleep "$(( MIN * 60 ))"

echo "→ Restarting ${CONTAINER} on ${IMAGE}…"
docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d --name "$CONTAINER" --restart unless-stopped \
  --pull always -p 8787:8787 -v untestedrealm-db:/data \
  "$IMAGE"

echo "✓ Done — ${CONTAINER} restarted."
