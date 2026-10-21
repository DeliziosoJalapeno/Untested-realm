#!/usr/bin/env bash
# Show a message to every player, as a banner at the top-centre of every page (with an ✕ to dismiss),
# for N minutes.
#
#   ./send-message.sh "<text>" <minutes>     e.g. ./send-message.sh "Tournament tonight at 21:00!" 30
#   ./send-message.sh --clear                take the current message down
#
# Plain text, up to 300 characters, at most 1440 minutes (1 day). A new message replaces the old one.
# It lives in the server's memory, so a restart clears it.
set -euo pipefail

CONTAINER="untestedrealm"

if [[ "${1:-}" == "--clear" ]]; then
  TEXT=""; MIN=0
else
  TEXT="${1:-}"; MIN="${2:-}"
  if [[ -z "$TEXT" || ! "$MIN" =~ ^[0-9]+$ || "$MIN" -lt 1 ]]; then
    echo "Usage: $0 \"<text>\" <minutes>   (whole minutes, >= 1)" >&2
    echo "       $0 --clear" >&2
    exit 1
  fi
fi

# node:alpine has no curl, but Node ships a global fetch. Run it INSIDE the container so the request comes
# from loopback and passes the server's local-only guard. The text travels as an env var, so quotes,
# apostrophes and $ in the message need no escaping.
docker exec -e MSG_TEXT="$TEXT" -e MSG_MIN="$MIN" "$CONTAINER" node -e "fetch('http://127.0.0.1:8787/api/message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:process.env.MSG_TEXT,minutes:Number(process.env.MSG_MIN)})}).then(r=>r.text()).then(t=>console.log('  server:',t)).catch(e=>{console.error(e);process.exit(1)})"

if [[ -z "$TEXT" ]]; then echo "✓ Message cleared."; else echo "✓ Showing for ${MIN} minute(s): $TEXT"; fi
