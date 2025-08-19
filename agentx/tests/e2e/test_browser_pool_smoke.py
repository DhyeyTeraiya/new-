import pytest

pytestmark = pytest.mark.skipif(
    not pytest.importorskip('playwright', reason='playwright not installed'),
    reason='playwright not available'
)

from agentx.executor.browser_pool import BrowserPool


def test_browserpool_smoke():
    pool = BrowserPool(max_browsers=1, max_pages_per_browser=1, headless=True)
    with pool:
        with pool.get_page() as handle:
            page = handle.page
            page.goto('https://example.com')
            assert 'Example Domain' in page.title()
    # pool will stop on context exit
