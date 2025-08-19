#!/usr/bin/env bash
set -euo pipefail

RESULTS_FILE=benchmarks/results.json
mkdir -p benchmarks

# Node build time
START=$(date +%s)
if command -v npm >/dev/null 2>&1; then
  npm --prefix apps/api run build --if-present || true
fi
END=$(date +%s)
NODE_BUILD_TIME=$((END-START))

# Python quick import timing
PY_TIME=0
if command -v python >/dev/null 2>&1 && [ -f agentx/requirements.txt ]; then
  python - <<'PY'
import time
start=time.time()
try:
    import pydantic
    import pytest
except Exception:
    pass
end=time.time()
print(end-start)
PY
fi

cat > "$RESULTS_FILE" <<JSON
{
  "node_build_time_seconds": $NODE_BUILD_TIME,
  "python_quick_import_seconds": $PY_TIME
}
JSON

echo "Benchmarks written to $RESULTS_FILE"
