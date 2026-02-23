#!/usr/bin/env bash
# mount_shares.sh – NFS share mount manager.
# Reads config/filers.json and config/shares.json and mounts configured shares.
# Idempotent: safe to run multiple times; skips already-mounted shares.
#
# Usage:
#   bash mount_shares.sh              # Mount all configured shares
#   bash mount_shares.sh --dry-run    # Print what would be done, no execution
#   bash mount_shares.sh --unmount-all # Unmount all configured shares
#   bash mount_shares.sh --discover   # showmount -e all filers, no writes
#
# Cron entry (run daily at 04:50, before the 05:00 snapshot):
#   50 4 * * * /opt/nas-dashboard/scripts/mount_shares.sh >> /var/log/nas_monitor/mount.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_DIR="${REPO_DIR}/config"
LOG_FILE="/var/log/nas_monitor/mount.log"
FILERS_JSON="${CONFIG_DIR}/filers.json"
SHARES_JSON="${CONFIG_DIR}/shares.json"
DRY_RUN=false
UNMOUNT_ALL=false
DISCOVER=false

# ── Parse flags ───────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "${arg}" in
    --dry-run)     DRY_RUN=true     ;;
    --unmount-all) UNMOUNT_ALL=true ;;
    --discover)    DISCOVER=true    ;;
  esac
done

# ── Logging ────────────────────────────────────────────────────────────────────
log() {
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[${ts}] $*" | tee -a "${LOG_FILE}" 2>/dev/null || echo "[${ts}] $*"
}

# Ensure log directory exists
mkdir -p "$(dirname "${LOG_FILE}")" 2>/dev/null || true

log "=== mount_shares.sh started ==="
if [ "${DRY_RUN}"     = "true" ]; then log "MODE: dry-run (no mounts will be executed)"; fi
if [ "${UNMOUNT_ALL}" = "true" ]; then log "MODE: unmount-all"; fi
if [ "${DISCOVER}"    = "true" ]; then log "MODE: discover"; fi

# ── Guard: config files must exist ────────────────────────────────────────────
if [ ! -f "${FILERS_JSON}" ]; then
  log "ERROR: ${FILERS_JSON} not found. Cannot continue."
  exit 1
fi
if [ ! -f "${SHARES_JSON}" ]; then
  log "ERROR: ${SHARES_JSON} not found. Cannot continue."
  exit 1
fi

# ── Dependency: node must be available for JSON parsing ───────────────────────
# Source nvm if available
if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # nvm.sh runs in the current shell; set +e prevents any internal nvm
  # command failure from triggering set -e in this script.
  set +e
  # shellcheck source=/dev/null
  source "${HOME}/.nvm/nvm.sh" 2>/dev/null
  set -e
fi

if ! command -v node &>/dev/null; then
  log "ERROR: node not found in PATH. Cannot parse JSON config."
  exit 1
fi

# ── Parse filers.json using node ──────────────────────────────────────────────
parse_filers() {
  node -e "
    const data = JSON.parse(require('fs').readFileSync('${FILERS_JSON}', 'utf8'));
    (data.filers || []).forEach(f => {
      // Output: name|host|target_folder|mount_options
      console.log(f.name + '|' + f.host + '|' + f.target_folder + '|' + f.mount_options);
    });
  "
}

# ── Parse shares.json using node ──────────────────────────────────────────────
parse_shares() {
  node -e "
    const data = JSON.parse(require('fs').readFileSync('${SHARES_JSON}', 'utf8'));
    (data.shares || []).forEach(s => {
      // Output: filer|export
      console.log(s.filer + '|' + s.export);
    });
  "
}

# ── Build mountpoint from target_folder + export basename ─────────────────────
# e.g., target_folder=/HNAS/, export=/exports/engineering → /HNAS/engineering
build_mountpoint() {
  local target_folder="$1"
  local export_path="$2"
  local base
  base=$(basename "${export_path}")
  # Strip trailing slash from target_folder
  echo "${target_folder%/}/${base}"
}

# ─────────────────────────────────────────────────────────────────────────────
# ── DISCOVER mode ────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
if [ "${DISCOVER}" = "true" ]; then
  log "Running showmount discovery against all filers ..."
  FILER_DATA=$(parse_filers) || {
    log "ERROR: Failed to parse filers.json — check for JSON syntax errors."
    exit 1
  }
  while IFS='|' read -r name host target mount_opts; do
    log "  -> showmount -e ${host} (filer: ${name})"
    # showmount timeout handling (mount script --discover mode):
    #   Enforce 10-second timeout. Print error to stdout and exit non-zero on timeout.
    if ! output=$(timeout 10 showmount -e "${host}" --no-headers 2>&1); then
      log "  ERROR: showmount failed or timed out for ${name} (${host})"
      echo "ERROR: showmount -e ${host} timed out or failed" >&2
    else
      log "  Exports from ${name} (${host}):"
      while IFS= read -r line; do
        log "    ${line}"
      done <<< "${output}"
    fi
  done <<< "${FILER_DATA}"
  log "=== Discovery complete ==="
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# ── Build filer lookup map ────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
declare -A FILER_HOST
declare -A FILER_TARGET
declare -A FILER_OPTS

FILER_DATA=$(parse_filers) || {
  log "ERROR: Failed to parse filers.json — check for JSON syntax errors."
  exit 1
}
while IFS='|' read -r name host target mount_opts; do
  FILER_HOST["${name}"]="${host}"
  FILER_TARGET["${name}"]="${target}"
  FILER_OPTS["${name}"]="${mount_opts}"
done <<< "${FILER_DATA}"

# ─────────────────────────────────────────────────────────────────────────────
# ── UNMOUNT ALL mode ──────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
if [ "${UNMOUNT_ALL}" = "true" ]; then
  log "Unmounting all configured shares ..."
  UNMOUNT_OK=0
  UNMOUNT_FAIL=0

  SHARE_DATA=$(parse_shares) || {
    log "ERROR: Failed to parse shares.json — check for JSON syntax errors."
    exit 1
  }
  while IFS='|' read -r filer_name export_path; do
    target="${FILER_TARGET[${filer_name}]:-}"
    if [ -z "${target}" ]; then
      log "  SKIP: Unknown filer '${filer_name}' for export ${export_path}"
      continue
    fi
    mountpoint=$(build_mountpoint "${target}" "${export_path}")

    if ! mount | grep -q " ${mountpoint} "; then
      log "  SKIP (not mounted): ${mountpoint}"
      continue
    fi

    if [ "${DRY_RUN}" = "true" ]; then
      log "  DRY-RUN: umount ${mountpoint}"
    else
      log "  Unmounting: ${mountpoint}"
      if umount "${mountpoint}" 2>&1 | tee -a "${LOG_FILE}"; then
        (( UNMOUNT_OK++ )) || true
      else
        log "  FAIL: umount ${mountpoint}"
        (( UNMOUNT_FAIL++ )) || true
      fi
    fi
  done <<< "${SHARE_DATA}"

  log "=== Unmount complete: ${UNMOUNT_OK} succeeded, ${UNMOUNT_FAIL} failed ==="
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# ── MOUNT mode (default) ──────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
ATTEMPTED=0
SUCCEEDED=0
SKIPPED=0
FAILED=0

SHARE_DATA=$(parse_shares) || {
  log "ERROR: Failed to parse shares.json — check for JSON syntax errors."
  exit 1
}
while IFS='|' read -r filer_name export_path; do
  target="${FILER_TARGET[${filer_name}]:-}"
  host="${FILER_HOST[${filer_name}]:-}"
  opts="${FILER_OPTS[${filer_name}]:-ro,soft,vers=3}"

  if [ -z "${target}" ] || [ -z "${host}" ]; then
    log "  SKIP: Filer '${filer_name}' not found in filers.json (export: ${export_path})"
    (( SKIPPED++ )) || true
    continue
  fi

  mountpoint=$(build_mountpoint "${target}" "${export_path}")
  (( ATTEMPTED++ )) || true

  # Skip if already mounted (idempotent)
  if mount | grep -q " ${mountpoint} "; then
    log "  SKIP (already mounted): ${mountpoint}"
    (( SKIPPED++ )) || true
    (( ATTEMPTED-- )) || true
    continue
  fi

  # Create mountpoint directory if needed
  if [ ! -d "${mountpoint}" ]; then
    if [ "${DRY_RUN}" = "true" ]; then
      log "  DRY-RUN: mkdir -p ${mountpoint}"
    else
      mkdir -p "${mountpoint}" 2>&1 | tee -a "${LOG_FILE}" || true
    fi
  fi

  # Mount command
  MOUNT_CMD="mount -t nfs -o ${opts} ${host}:${export_path} ${mountpoint}"

  if [ "${DRY_RUN}" = "true" ]; then
    log "  DRY-RUN: ${MOUNT_CMD}"
    (( SUCCEEDED++ )) || true
  else
    log "  Mounting: ${host}:${export_path} → ${mountpoint}"
    # Each mount attempt is wrapped individually. Failure logs and continues.
    if eval "${MOUNT_CMD}" 2>&1 | tee -a "${LOG_FILE}"; then
      log "  OK: ${mountpoint}"
      (( SUCCEEDED++ )) || true
    else
      log "  FAIL: mount ${host}:${export_path} → ${mountpoint}"
      (( FAILED++ )) || true
    fi
  fi

done <<< "${SHARE_DATA}"

log "=== Mount run complete: ${ATTEMPTED} attempted, ${SUCCEEDED} succeeded, ${SKIPPED} skipped, ${FAILED} failed ==="

# Exit non-zero if any mounts failed
[ "${FAILED}" -eq 0 ]
