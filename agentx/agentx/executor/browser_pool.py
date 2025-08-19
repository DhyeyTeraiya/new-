from __future__ import annotations
import contextlib
import threading
import queue
from typing import Optional

from playwright.sync_api import sync_playwright, Playwright, Browser, Page

from ..logging.logger import get_logger

logger = get_logger('browser_pool')


class PageHandle:
    def __init__(self, page: Page, browser_idx: int, pool: 'BrowserPool'):
        self.page = page
        self.browser_idx = browser_idx
        self._pool = pool

    def release(self):
        """Return the page to the pool."""
        self._pool._release(self)


class BrowserPool:
    """Simple synchronous Playwright browser pool.

    Usage:
        pool = BrowserPool(max_browsers=2, max_pages_per_browser=3)
        with pool.get_page() as handle:
            page = handle.page
            page.goto('https://example.com')

    The pool keeps browsers and contexts alive and reuses pages to reduce startup cost.
    """

    def __init__(self, max_browsers: int = 2, max_pages_per_browser: int = 4, headless: bool = True):
        self.max_browsers = max_browsers
        self.max_pages_per_browser = max_pages_per_browser
        self.headless = headless

        self._playwright: Optional[Playwright] = None
        self._browsers: list[Browser] = []
        self._pages_queues: list[queue.Queue] = []
        self._lock = threading.Lock()
        self._started = False

    def start(self):
        with self._lock:
            if self._started:
                return
            self._playwright = sync_playwright().start()
            for i in range(self.max_browsers):
                browser = self._playwright.chromium.launch(headless=self.headless)
                self._browsers.append(browser)
                q: queue.Queue = queue.Queue()
                # pre-create a few pages per browser
                for _ in range(self.max_pages_per_browser):
                    ctx = browser.new_context()
                    page = ctx.new_page()
                    q.put((page, ctx))
                self._pages_queues.append(q)
            self._started = True
            logger.info(f'BrowserPool started: browsers={len(self._browsers)}, pages_per_browser={self.max_pages_per_browser}')

    def stop(self):
        with self._lock:
            if not self._started:
                return
            for q in self._pages_queues:
                while not q.empty():
                    page, ctx = q.get_nowait()
                    with contextlib.suppress(Exception):
                        page.close()
                    with contextlib.suppress(Exception):
                        ctx.close()
            for b in self._browsers:
                with contextlib.suppress(Exception):
                    b.close()
            if self._playwright:
                with contextlib.suppress(Exception):
                    self._playwright.stop()
            self._browsers = []
            self._pages_queues = []
            self._started = False
            logger.info('BrowserPool stopped')

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.stop()

    def _acquire(self, timeout: Optional[float] = None) -> PageHandle:
        # Round-robin search for an available page
        if not self._started:
            self.start()
        start_idx = 0
        n = len(self._pages_queues)
        for i in range(n):
            idx = (start_idx + i) % n
            q = self._pages_queues[idx]
            try:
                page, ctx = q.get(timeout=timeout)
                return PageHandle(page=page, browser_idx=idx, pool=self)
            except queue.Empty:
                continue
        # If none available, create a temporary page on the first browser
        with self._lock:
            if self._browsers:
                ctx = self._browsers[0].new_context()
                page = ctx.new_page()
                return PageHandle(page=page, browser_idx=0, pool=self)
        raise RuntimeError('No browsers available')

    def _release(self, handle: PageHandle):
        idx = handle.browser_idx
        # Try to return to queue; if full, close page and context
        try:
            q = self._pages_queues[idx]
        except Exception:
            with contextlib.suppress(Exception):
                handle.page.close()
            return
        try:
            # We don't have the ctx object here for temporary pages; assume page belongs to a context still open
            q.put((handle.page, handle.page.context), block=False)
        except Exception:
            with contextlib.suppress(Exception):
                handle.page.close()

    @contextlib.contextmanager
    def get_page(self, timeout: Optional[float] = 5.0):
        handle = self._acquire(timeout=timeout)
        try:
            yield handle
        finally:
            try:
                handle.release()
            except Exception:
                logger.exception('Failed to release page back to pool')
