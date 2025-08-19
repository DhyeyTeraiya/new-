from __future__ import annotations
from typing import List

from ..planner.task_planner import TaskPlanner
from ..executor.web_navigator import WebNavigator
from ..memory.storage import MemoryManager
from ..logging.logger import get_logger

logger = get_logger('agent')

class BaseAgent:
    def __init__(self, planner: TaskPlanner | None = None, memory: MemoryManager | None = None):
        self.planner = planner or TaskPlanner()
        self.memory = memory or MemoryManager()

    def run(self, goal: str, allowed_domains: list[str] | None = None) -> dict:
        run_id = self.memory.create_run(goal)
        context = self.memory.recent_context()
        analysis = self.planner.analyze(goal, context)
        plan = self.planner.plan(goal, context)
        logger.info(f'Plan: {plan}')

        observations: List[str] = []
        with WebNavigator() as nav:
            if allowed_domains:
                nav.security.allowed_domains = allowed_domains
            for idx, step in enumerate(plan, start=1):
                try:
                    obs = self._execute_step(nav, step)
                    observations.append(obs)
                    self.memory.add_step(run_id, idx, step, obs)
                except Exception as e:
                    dom = nav.snapshot_dom() if nav.page else ''
                    observation = f"Error: {e}\nDOM: {dom[:2000]}"
                    logger.error(f'Step failed: {e}')
                    plan = self.planner.replan(goal, context, plan, observation)
                    logger.info(f'Re-planned: {plan}')
                    continue

        summary = "\n".join(observations[-5:])
        self.memory.add_artifact(run_id, 'summary.txt', summary)
        return {'run_id': run_id, 'analysis': analysis, 'plan': plan, 'observations': observations, 'summary': summary}

    def _execute_step(self, nav: WebNavigator, step: str) -> str:
        import time
        from urllib.parse import quote_plus

        s = step.lower().strip()

        # Navigate/Open URL
        if s.startswith('navigate') or s.startswith('open'):
            url = 'https://example.com'
            for token in step.split():
                if token.startswith('http://') or token.startswith('https://'):
                    url = token
            nav.goto(url)
            return f"navigated:{url}"

        # Search query (google)
        if s.startswith('search'):
            # extract query after 'search' or 'search for'
            parts = step.split(maxsplit=1)
            query = parts[1] if len(parts) > 1 else ''
            query = query.replace('for', '', 1).strip(' "') if query.startswith('for ') else query.strip(' "')
            if not query:
                return 'noop:empty-search'
            url = f"https://www.google.com/search?q={quote_plus(query)}"
            nav.goto(url)
            return f"searched:{query}"

        # Click with fallbacks
        if s.startswith('click'):
            # Try to find a quoted target: click "Submit" or click "#id"
            target = None
            if '"' in step:
                parts = step.split('"')
                if len(parts) >= 3:
                    target = parts[1].strip()
            target = target or 'a, button'
            try:
                if hasattr(nav, 'click_best'):
                    nav.click_best(target)
                else:
                    nav.click(target)
            except Exception as e:
                raise
            return f"clicked:{target}"

        # Type/Fill input with fallbacks
        if s.startswith('type') or s.startswith('fill'):
            # type "hello" into "#q"
            text = None
            field = None
            parts = step.split('"')
            if len(parts) >= 2:
                text = parts[1]
            if ' into ' in step and len(parts) >= 4:
                field = parts[3]
            field = field or 'input, textarea'
            if hasattr(nav, 'type_best'):
                nav.type_best(field, text or '')
            else:
                nav.type(field, text or '')
            return f"typed:{text} into:{field}"

        # Wait
        if s.startswith('wait'):
            # wait 2s
            secs = 1.0
            for tok in s.split():
                if tok.endswith('ms'):
                    try:
                        secs = float(tok[:-2]) / 1000.0
                    except Exception:
                        pass
                elif tok.endswith('s'):
                    try:
                        secs = float(tok[:-1])
                    except Exception:
                        pass
            time.sleep(secs)
            return f"waited:{secs}s"

        # Extract text
        if s.startswith('extract') or 'title' in s:
            selector = 'title'
            if '"' in step:
                parts = step.split('"')
                if len(parts) >= 2:
                    selector = parts[1]
            text = nav.extract_text(selector)
            return f"extract:{selector}:{text}"

        return f"noop:{step}"
