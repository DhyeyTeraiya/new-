# AgentX: Analyze → Plan → Execute → Observe

AgentX is a modular, secure, and extensible AI agent framework implementing the Analyze → Plan → Execute → Observe loop.
It integrates browser automation (Playwright), persistent memory (SQLite/JSON + simple vector search), multi-agent orchestration,
and security guardrails for sandboxed execution.

## Architecture

```mermaid
flowchart TD
    UI[Minimal Frontend (CLI/Logs)] --> Orchestrator
    subgraph Backend
        Orchestrator[LLM Orchestrator]
(OpenAI/Anthropic/Mock) --> Planner[Task Planner]
(Reflection & Re-Plan)
        Planner --> Agents[Multi-Agent Orchestrator]
        Agents --> Executor[Web Navigator]
(Playwright)
        Executor --> Observe[Observer]
(Error Detection)
        Observe --> Planner
        Orchestrator --> Memory[Context Manager]
(SQLite/JSON + Vector)
        Executor --> Security[Security Layer]
(Permissions, Rate Limits, Isolation)
    end
    Logs[Structured Logging] ---> UI
```

## Features
- Analyze → Plan → Execute → Observe loop with re-planning and reflection
- Browser automation via Playwright (sandboxed incognito contexts)
- Persistent memory: SQLite for runs, JSON cache, simple vector similarity
- Multi-agent: specialized agents (Researcher, Login, Form)
- Security guardrails: domain allow-list, cookie whitelist, input sanitization, rate limits
- Modular and extensible codebase
- Dockerized sandbox execution
- Unit and E2E tests

## Quickstart

1) Prerequisites:
- Python 3.10+
- Windows/Mac/Linux

2) Setup
```bash
cd agentx
python -m venv .venv
# Windows PowerShell
. .venv/Scripts/Activate.ps1
# Mac/Linux
# source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install --with-deps chromium
cp .env.example .env
```

3) Run
```bash
python -m agentx.app --goal "Research topic: Playwright best practices" --allow-domain example.com --allow-domain playwright.dev
```

4) Docker
```bash
# Build
docker build -t agentx:latest .
# Run (mount local workspace for outputs)
docker run --rm -it --shm-size=1g --env-file .env agentx:latest \
  python -m agentx.app --goal "Visit example.com and extract title" --allow-domain example.com
```

## Testing
```bash
pytest -q
pytest -m e2e -q  # E2E tests (requires Playwright browsers installed)
```

## Configuration
- Environment variables in `.env` (OpenAI/Anthropic keys optional; falls back to mock LLM)
- Security: allowed domains and cookie whitelist enforced by `SecurityManager`
- Rate limits: token-bucket per origin (configurable)

## Security
- Incognito browser contexts and isolated sessions per run
- Domain allow-listing before any navigation
- Input sanitization for unsafe JS payloads
- Whitelisted cookies stored only
- Credentials encrypted at rest via Fernet

## Project Layout
```
agentx/
  agentx/
    agents/              # Base & specialized agents
    executor/            # Playwright web navigator
    llm/                 # LLM orchestration
    memory/              # SQLite/JSON store + vector search
    planner/             # Task planner with reflection
    logging/             # Structured logger
    app.py               # CLI entrypoint
  tests/
    unit/
    e2e/
  requirements.txt
  Dockerfile
  README.md
```
