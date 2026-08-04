#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${IN_NIX_SHELL:-}" ]]; then
  exec nix develop --command bun run verify:change
fi

echo "Checking staged and unstaged patches..."
git diff --cached --check
git diff --check

echo "Checking E2E screenshot-step conventions..."
bun run check:e2e-steps

echo "Running static checks..."
bun run check
bun run check:workflow

echo "Running unit tests..."
bun run test:unit

echo "Checking Firestore rules in the emulator..."
bun run test:rules

echo "Running the complete E2E suite..."
bun run test:e2e

echo "Building the production client..."
bun run build
