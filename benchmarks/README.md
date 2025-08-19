This folder contains simple synthetic benchmark helpers used by the CI workflow.

- `run_benchmarks.sh` - Unix shell script that times a Node build and does a Python import timing.
- `run_benchmarks.ps1` - PowerShell equivalent.
- `results.json` - output written by the scripts (created by CI).

How CI uses this
- The GitHub Actions workflow `ci-bench.yml` runs `run_benchmarks.sh` and uploads `benchmarks/results.json` as an artifact.

Local usage
- On Windows PowerShell (recommended):

```powershell
.\benchmarks\run_benchmarks.ps1
```

- On WSL / Linux / macOS:

```bash
./benchmarks/run_benchmarks.sh
```
