#!/usr/bin/env bash
# Run every end to end scenario: the delivered image against real pages in a
# real browser, driven through docker compose the way a user drives it.
#
# Usage: bash tests/run-e2e.sh [vitest-args...]
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="tests/e2e/docker-compose.yml"

cleanup() {
    docker compose -f "$COMPOSE" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Cleaning up leftovers of an earlier run..."
cleanup
rm -rf tests/e2e/results

echo "==> Building the scanner image..."
docker compose build

echo "==> Building the test stack..."
docker compose -f "$COMPOSE" build

echo "==> Running the scenarios..."
npx vitest run --config tests/e2e/vitest.config.ts "$@"
