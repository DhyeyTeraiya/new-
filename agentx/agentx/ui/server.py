from __future__ import annotations
import os
from threading import Thread
from flask import Flask, request, redirect, url_for, render_template_string

from ..agents.orchestrator import MultiAgentRunner, OrchestratorConfig
from ..runtime.run_manager import run_manager

TEMPLATE = 
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>AgentX Dashboard</title>
<style>
body { font-family: system-ui, sans-serif; margin: 0; }
header { background: #111; color: #fff; padding: 8px 12px; display: flex; justify-content: space-between; }
section { padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
form { display: grid; gap: 8px; }
textarea { width: 100%; height: 80px; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap: 8px; }
.card { border: 1px solid #ddd; padding: 8px; }
pre { white-space: pre-wrap; word-wrap: break-word; max-height: 400px; overflow: auto; background: #fafafa; border: 1px solid #eee; padding: 8px; }
.btn { padding: 6px 10px; background: #0a84ff; color: #fff; border: none; cursor: pointer; }
.btn:disabled { background: #999; cursor: not-allowed; }
</style>
</head>
<body>
<header>
  <div>AgentX Dashboard</div>
  <div>Status: {{ 'RUNNING' if running else 'IDLE' }}</div>
</header>
<section>
  <div class="card">
    <h3>Start a run</h3>
    <form method="post" action="{{ url_for('start') }}">
      <label>Goal</label>
      <textarea name="goal">Open https://example.com and extract title</textarea>
      <label>Allowed domains (comma-separated)</label>
      <input name="domains" value="example.com" />
      <label>Headless</label>
      <input type="checkbox" name="headless" checked />
      <label>Show (overrides headless)</label>
      <input type="checkbox" name="show" />
      <label>Screenshots dir</label>
      <input name="shots" value="./shots" />
      <label>Downloads dir</label>
      <input name="downloads" value="./downloads" />
      <div>
        <button class="btn" type="submit" {{ 'disabled' if running else '' }}>Start</button>
        <a class="btn" href="{{ url_for('stop') }}" style="background:#ff3b30;">Stop</a>
      </div>
    </form>
  </div>
  <div class="card">
    <h3>Logs</h3>
    <pre>{{ logs }}</pre>
  </div>
</section>
<section>
  <div class="card" style="grid-column: 1 / -1;">
    <h3>Screenshots</h3>
    <div class="gallery">
      {% for img in images %}
      <div>
        <img src="{{ img }}" alt="screenshot" style="max-width: 100%; border:1px solid #eee;" />
      </div>
      {% endfor %}
    </div>
  </div>
</section>
</body>
</html>


app = Flask(__name__)

@app.get('/')
def index():
    # Logs
    log_file = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'runtime.log'))
    data = '(no logs)'
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                data = f.read()[-30000:]
        except Exception:
            data = '(log read error)'
    # Screenshots (static file server not configured, use file:// for preview or absolute paths)
    shots_dir = os.path.abspath(os.path.join(os.getcwd(), 'shots'))
    os.makedirs(shots_dir, exist_ok=True)
    images = []
    for p in sorted(os.listdir(shots_dir)):
        if p.lower().endswith('.png'):
            images.append(f'file://{os.path.join(shots_dir, p)}')
    return render_template_string(TEMPLATE, logs=data, images=images, running=run_manager.state.running)

@app.post('/run')
def start():
    goal = request.form.get('goal','Open https://example.com and extract title')
    domains = [d.strip() for d in (request.form.get('domains','example.com').split(',')) if d.strip()]
    headless = bool(request.form.get('headless'))
    show = bool(request.form.get('show'))
    shots = request.form.get('shots','./shots').strip()
    downloads = request.form.get('downloads','./downloads').strip()

    os.makedirs(shots, exist_ok=True)
    os.makedirs(downloads, exist_ok=True)

    def _target():
        runner = MultiAgentRunner(config=OrchestratorConfig(
            headless=(headless or not show),
            screenshots_dir=shots,
            downloads_dir=downloads,
        ))
        return runner.run(goal, allowed_domains=domains)

    run_manager.start(_target)
    return redirect(url_for('index'))

@app.get('/stop')
def stop():
    run_manager.stop()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5055, debug=False)
