import pytest

from agentx.executor.browser_pool import BrowserPool


def test_browserpool_start_stop():
    pool = BrowserPool(max_browsers=1, max_pages_per_browser=1, headless=True)
    # Should start and stop without raising
    pool.start()
    assert pool._started
    pool.stop()
    assert not pool._started
