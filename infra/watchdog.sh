#!/bin/sh
# ============================================================================
# watchdog.sh — the box watches itself, because nothing else does
# ============================================================================
#
# WHY THIS EXISTS. Two failure modes have happened on this VPS and neither had
# an alarm on it:
#
#   1. THE DISK FILLS. Docker build cache has filled it three times; one deploy
#      took it 33% -> 72% in a single build. A full disk stops Postgres clients,
#      Docker and the worker's temp files all at once, and the first symptom is
#      a customer's job failing for a reason that looks like anything but disk.
#   2. THE SITE GOES DOWN. There is no uptime check on `/`. Today a down site is
#      discovered by a visitor.
#
# The app already has an alert channel — `apps/worker/src/alert.ts` POSTs one
# line to $ALERT_WEBHOOK_URL on a failed job — so this reuses it rather than
# inventing a second one. With the variable unset the script still runs and
# still logs to the journal; it just cannot reach anyone. That is deliberate:
# the check working is worth something on its own (`journalctl -u adgen-watchdog`
# after an incident), and a missing webhook must not make the timer fail.
#
# WHAT IT DOES NOT DO. It does not restart anything, prune anything, or page
# anyone twice. Auto-pruning a "full" disk is how a build cache someone is
# mid-deploy with disappears; this reports and stops. One line per problem.
#
# INSTALL (not done automatically — this is a standing change to the box):
#   scp infra/watchdog.sh root@5.75.154.153:/usr/local/bin/adgen-watchdog
#   scp infra/watchdog.service infra/watchdog.timer root@5.75.154.153:/etc/systemd/system/
#   ssh root@5.75.154.153 'chmod +x /usr/local/bin/adgen-watchdog \
#     && systemctl daemon-reload && systemctl enable --now adgen-watchdog.timer'
# Verify with:  systemctl list-timers adgen-watchdog  ·  journalctl -u adgen-watchdog -n 20
# ============================================================================

set -eu

DISK_WARN_PCT="${DISK_WARN_PCT:-80}"
SITE_URL="${SITE_URL:-http://127.0.0.1/}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-adgen}"

# The env file holds ALERT_WEBHOOK_URL alongside the app's other secrets. Sourced
# rather than duplicated so there is one place to set it.
if [ -f /srv/adgen/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /srv/adgen/.env
  set +a
fi

problems=""

note() {
  # Journal first, always. The webhook is best-effort on top of it.
  echo "$1"
  problems="${problems}${problems:+ | }$1"
}

# --- 1. disk ---------------------------------------------------------------
used_pct="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [ "$used_pct" -ge "$DISK_WARN_PCT" ]; then
  note "disk ${used_pct}% used on / (threshold ${DISK_WARN_PCT}%) — docker builder prune -af reclaims the build cache"
fi

# --- 2. the site answers ---------------------------------------------------
# --max-time so a hung server is a failure rather than a hung timer.
#
# No `|| echo 000` here: curl ALREADY prints 000 when it cannot connect, and on
# top of a non-zero exit the fallback appended a second one — the first dry run
# on the real box reported "answered 000000". `|| true` keeps `set -e` happy
# without writing to stdout, and the empty-string guard covers a curl that dies
# before printing anything at all.
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$SITE_URL" 2>/dev/null || true)"
[ -n "$code" ] || code="000"
if [ "$code" != "200" ]; then
  note "site check failed: ${SITE_URL} answered ${code} (expected 200)"
fi

# --- 3. containers ---------------------------------------------------------
# `docker ps` lists only RUNNING containers, so a crashed one disappears from
# this list rather than showing as unhealthy — which is why the check counts
# what is present instead of grepping for a bad status.
for name in web worker redis; do
  container="adgen-${name}-prod"
  status="$(docker inspect -f '{{.State.Status}}:{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || echo "missing")"
  case "$status" in
    running:healthy | running:none) ;;
    *) note "container ${container} is ${status}" ;;
  esac
done

if [ -z "$problems" ]; then
  echo "ok: disk ${used_pct}%, site ${code}, three containers healthy"
  exit 0
fi

# --- report ----------------------------------------------------------------
if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
  # Same shape as the worker's alert: one line, JSON body with a `content` field
  # (Discord's schema, which Slack and most relays also accept).
  payload="$(printf '{"content":"[adgen-watchdog] %s"}' "$(echo "$problems" | sed 's/"/\\"/g')")"
  curl -s -o /dev/null --max-time 10 -X POST -H 'Content-Type: application/json' \
    -d "$payload" "$ALERT_WEBHOOK_URL" || echo "warn: webhook POST failed"
fi

# Non-zero so `systemctl status` and the journal both mark the run as failed —
# a timer that always exits 0 is invisible in every dashboard that reads unit
# state rather than log text.
exit 1
