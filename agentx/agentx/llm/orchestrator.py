from __future__ import annotations
from typing import List
from ..config import settings
from ..logging.logger import get_logger

logger = get_logger('llm')

class MockLLM:
    def complete(self, prompt: str) -> str:
        if 'Plan:' in prompt:
            return '1) Navigate to relevant sites\n2) Extract required data\n3) Validate results and summarize'
        if 'Analyze:' in prompt:
            return 'User intent identified; constraints and success criteria noted.'
        if 'Reflect:' in prompt:
            return 'Adjust selectors and add waits; retry failed steps.'
        return 'Summary generated.'

class LLMOrchestrator:
    def __init__(self):
        self.provider = None
        self.client = None
        if settings.openai_api_key:
            try:
                from openai import OpenAI
                self.client = OpenAI(api_key=settings.openai_api_key)
                self.provider = 'openai'
            except Exception as e:
                logger.warning(f'OpenAI init failed: {e}; falling back to MockLLM')
        elif settings.anthropic_api_key:
            try:
                import anthropic
                self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
                self.provider = 'anthropic'
            except Exception as e:
                logger.warning(f'Anthropic init failed: {e}; falling back to MockLLM')
        if self.client is None:
            self.provider = 'mock'
            self.client = MockLLM()
        logger.info(f'LLM provider: {self.provider}')

    def _openai_chat(self, system: str, user: str) -> str:
        resp = self.client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role":"system","content":system},{"role":"user","content":user}],
            temperature=0.2,
        )
        return resp.choices[0].message.content or ''

    def _anthropic(self, system: str, user: str) -> str:
        resp = self.client.messages.create(
            model=settings.anthropic_model,
            system=system,
            max_tokens=800,
            messages=[{"role":"user","content":user}],
        )
        return resp.content[0].text if resp.content else ''

    def complete(self, system: str, user: str) -> str:
        if self.provider == 'openai':
            return self._openai_chat(system, user)
        if self.provider == 'anthropic':
            return self._anthropic(system, user)
        return self.client.complete(user)

    def analyze(self, goal: str, context: str) -> str:
        return self.complete(
            system='You analyze tasks for a web automation agent.',
            user=f'Analyze: goal= {goal}\nContext: {context}',
        )

    def plan(self, goal: str, context: str) -> List[str]:
        text = self.complete(
            system='You produce ordered, concise web-automation steps.',
            user=f'Plan: goal= {goal}\nContext: {context}\nOutput numbered short steps.',
        )
        steps: list[str] = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            if line[0].isdigit():
                if ')' in line[:3]:
                    line = line.split(')', 1)[-1]
                elif '.' in line[:3]:
                    line = line.split('.', 1)[-1]
            steps.append(line.strip())
        return steps or ['Open browser', 'Navigate to target', 'Extract data', 'Summarize']

    def reflect(self, last_plan: list[str], observation: str) -> str:
        return self.complete(
            system='You provide brief, actionable improvements to the plan.',
            user=f'Reflect: plan= {last_plan}\nObservation: {observation}',
        )
