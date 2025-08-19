$results = @{ }
$results.node_build_time_seconds = 0
if (Get-Command npm -ErrorAction SilentlyContinue) {
    $start = Get-Date
    npm --prefix apps/api run build --if-present
    $end = Get-Date
    $results.node_build_time_seconds = ($end - $start).TotalSeconds
}

$results.python_quick_import_seconds = 0
if (Get-Command python -ErrorAction SilentlyContinue -and Test-Path agentx\requirements.txt) {
    $start = Get-Date
    python -c "import time
try:
 import pydantic
 import pytest
except Exception:
 pass
print(time.time())"
    $end = Get-Date
    $results.python_quick_import_seconds = ($end - $start).TotalSeconds
}

$results | ConvertTo-Json | Out-File -FilePath benchmarks\results.json -Encoding utf8
Write-Output "Benchmarks written to benchmarks\results.json"
