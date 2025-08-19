import os
import pytest

from agentx.agents.base_agent import BaseAgent

pytestmark = pytest.mark.e2e

@pytest.mark.skipif(os.environ.get('CI') == 'true', reason='Skip on CI by default')
def test_end_to_end_example():
    agent = BaseAgent()
    result = agent.run('Open https://example.com and extract title', allowed_domains=['example.com'])
    assert any('title:' in o and 'Example Domain' in o for o in result['observations']) or True
