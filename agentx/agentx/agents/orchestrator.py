from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional

from .base_agent import BaseAgent
from .specialized.researcher_agent import ResearcherAgent
from .specialized.login_agent import LoginAgent
from .specialized.form_agent import FormAgent
from ..executor.web_navigator import WebNavigator
from ..memory.storage import MemoryManager
from ..logging.logger import get_logger
from ..runtime.run_manager import run_manager

logger = get_logger('orchestrator')

@dataclass
class OrchestratorConfig:
    headless: bool = True
    screenshots_dir: Optional[str] = None
    downloads_dir: Optional[str] = None

class ValidatorAgent(BaseAgent):
    def validate(self, observation: str) -> bool:
        # simple heuristic for MVP
        bad = any(k in observation.lower() for k in ['error', 'timeout', 'not found'])
        return not bad

class MultiAgentRunner:
    def __init__(self, memory: MemoryManager | None = None, config: OrchestratorConfig | None = None):
        self.memory = memory or MemoryManager()
        self.base = BaseAgent(memory=self.memory)
        self.researcher = ResearcherAgent(memory=self.memory)
        self.login = LoginAgent(memory=self.memory)
        self.form = FormAgent(memory=self.memory)
        self.validator = ValidatorAgent(memory=self.memory)
        self.cfg = config or OrchestratorConfig()

    def classify(self, step: str) -> str:
        s = step.lower()
        if 'login' in s or 'sign in' in s:
            return 'login'
        if 'form' in s or 'fill' in s or 'submit' in s:
            return 'form'
        if 'research' in s or 'search' in s or 'summarize' in s:
            return 'research'
        return 'base'

    def run(self, goal: str, allowed_domains: list[str] | None = None) -> dict:
        run_id = self.memory.create_run(goal)
        context = self.memory.recent_context()
        plan = self.base.planner.plan(goal, context)
        observations: List[str] = []
        with WebNavigator() as nav:
            nav.start(headless=self.cfg.headless, downloads_path=self.cfg.downloads_dir)
            if allowed_domains:
                nav.security.allowed_domains = allowed_domains
            for idx, step in enumerate(plan, start=1):
                if run_manager.should_stop():
                    logger.info("Stop flag detected, aborting run")
                    break
                who = self.classify(step)
                agent = {
                    'base': self.base,
                    'login': self.login,
                    'form': self.form,
                    'research': self.researcher,
                }[who]
                try:
                    obs = agent._execute_step(nav, step)
                    # Screenshot key moments
                    if self.cfg.screenshots_dir:
                        import os
                        os.makedirs(self.cfg.screenshots_dir, exist_ok=True)
                        nav.screenshot(os.path.join(self.cfg.screenshots_dir, f'step_{idx}_{who}.png'))
                    observations.append(f'[{who}] {obs}')
                    self.memory.add_step(run_id, idx, f'{who}:{step}', obs)
                    if not self.validator.validate(obs):
                        dom = nav.snapshot_dom()
                        repl = self.base.planner.replan(goal, context, plan, f'Validation failed: {obs}\nDOM: {dom[:2000]}')
                        plan = repl
                        logger.info(f'Re-planned due to validation: {plan}')
                        continue
                except Exception as e:
                    dom = nav.snapshot_dom() if nav.page else ''
                    observation = f'Error: {e}\nDOM: {dom[:2000]}'
                    logger.error(f'Step failed ({who}): {e}')
                    plan = self.base.planner.replan(goal, context, plan, observation)
                    logger.info(f'Re-planned: {plan}')
                    continue
        summary = '\n'.join(observations[-5:])
        self.memory.add_artifact(run_id, 'summary.txt', summary)
        return {'run_id': run_id, 'plan': plan, 'observations': observations, 'summary': summary}
