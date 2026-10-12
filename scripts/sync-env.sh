#!/bin/bash
# Copies non-empty vars from .env.local to Vercel (production + preview) via stdin,
# so values never appear in command lines or output. Usage: scripts/sync-env.sh [NAME ...]
set -u
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
KEYS="GEMINI_API_KEY GEMINI_MODEL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY RESEND_API_KEY BRIEF_RECIPIENT_EMAIL BRIEF_FROM_EMAIL CRON_SECRET ADMIN_PASSWORD APP_URL"
[ $# -gt 0 ] && KEYS="$*"
for k in $KEYS; do
  v=$(grep -E "^$k=" .env.local | head -1 | cut -d= -f2-)
  [ -z "$v" ] && { echo "$k: empty, skipped"; continue; }
  for env in production preview; do
    printf '%s' "$v" | vercel env add "$k" "$env" --force --yes >/dev/null 2>&1 \
      && echo "$k -> $env: ok" || echo "$k -> $env: FAILED"
  done
done
