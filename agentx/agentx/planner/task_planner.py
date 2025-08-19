from __future__ import annotations
from typing import List
from ..llm.orchestrator import LLMOrchestrator

class TaskPlanner:
    def __init__(self, orchestrator: LLMOrchestrator | None = None):
        self.orch = orchestrator or LLMOrchestrator()

    def analyze(self, goal: str, context: str) -> str:
        return self.orch.analyze(goal, context)

    def plan(self, goal: str, context: str) -> List[str]:
        return self.orch.plan(goal, context)

    def replan(self, goal: str, context: str, last_plan: List[str], observation: str) -> List[str]:
        _ = self.orch.reflect(last_plan, observation)
        context2 = (context or '') + '\nObservation:' + observation
        return self.plan(goal, context2)
