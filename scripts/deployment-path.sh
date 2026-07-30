#!/usr/bin/env bash
set -euo pipefail

if [[ "${EVENT_NAME:-}" == "pull_request" ]]; then
  : "${PR_NUMBER:?PR_NUMBER is required for a pull-request deployment}"
  echo "base=/roborally/pr${PR_NUMBER}" >> "${GITHUB_OUTPUT}"
  echo "destination=pr${PR_NUMBER}" >> "${GITHUB_OUTPUT}"
else
  echo "base=/roborally" >> "${GITHUB_OUTPUT}"
  echo "destination=" >> "${GITHUB_OUTPUT}"
fi
