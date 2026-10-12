#!/bin/bash
# Prompts (hidden) for one secret, saves it to .env.local, then copies it to Vercel.
set -u
cd "$(dirname "$0")/.."
k="$1"
printf 'Paste %s and press Enter (nothing will show while you paste): ' "$k"
IFS= read -rs v; echo
v="$(printf '%s' "$v" | tr -d '[:space:]')"
[ -z "$v" ] && { echo "Nothing pasted - try again."; exit 1; }
python3 - "$k" "$v" <<'PY'
import sys, re
k, v = sys.argv[1], sys.argv[2]
p = ".env.local"; s = open(p).read()
s = re.sub(rf"^{k}=.*$", lambda m: f"{k}={v}", s, flags=re.M) if re.search(rf"^{k}=", s, re.M) else s + f"\n{k}={v}\n"
open(p, "w").write(s)
PY
echo "Saved $k locally (${#v} characters). Copying to Vercel..."
scripts/sync-env.sh "$k"
echo "All done - go back to the chat and type: done"
