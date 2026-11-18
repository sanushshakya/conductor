#!/usr/bin/env bash
# Prepares the Python sidecar for packaging.
#
# The sidecar ships as SOURCE plus a requirements file, not as a frozen binary.
# That is a deliberate trade:
#
#   * PyInstaller would remove the need for Python on the learner's machine,
#     but produces a ~60MB binary per architecture, needs signing on macOS,
#     and fails in ways that are extremely hard to diagnose remotely.
#   * Shipping source means the app builds its own virtualenv on first run,
#     in the background, while the learner is already inside Track 0. If that
#     fails, Boot and SQL still work and the app says so.
#
# The second option fails softer, which is what matters for a first-time user.
# If Python-free installs ever become a requirement, this is the script that
# would change.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIDECAR="$ROOT/services/mentor"

echo "Checking the sidecar is complete…"
test -f "$SIDECAR/requirements.txt" || { echo "missing requirements.txt"; exit 1; }
test -f "$SIDECAR/app/main.py" || { echo "missing app/main.py"; exit 1; }

echo "Verifying requirements are pinned…"
if grep -vE '^\s*(#|$)' "$SIDECAR/requirements.txt" | grep -qvE '=='; then
  echo "every requirement must be pinned with == so a build is reproducible" >&2
  exit 1
fi

echo "Sidecar ready: $(grep -cvE '^\s*(#|$)' "$SIDECAR/requirements.txt") pinned dependencies."
