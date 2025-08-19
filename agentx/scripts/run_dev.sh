#!/usr/bin/env bash
set -euo pipefail
python -m agentx.app --goal "${1:-Open https://example.com and extract title}" --allow-domain example.com
