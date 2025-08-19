from __future__ import annotations
import contextlib
from tenacity import retry, stop_after_attempt, wait_exponential

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError, expect

from ..logging.logger import get_logger
from ..security import SecurityManager
from ..memory.vector_store import SimpleVectorStore
from .selector_memory import SelectorMemory

logger = get_logger('navigator')

class WebNavigator:
    recorder = None  # set externally to enable recording
    def __init__(self, security: SecurityManager | None = None):
        self.security = security or SecurityManager()
        self._playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.sel_mem = SelectorMemory()

    def start(self, headless: bool = True, downloads_path: str | None = None):
        if self._playwright:
            return
        self._playwright = sync_playwright().start()
        self.browser = self._playwright.chromium.launch(headless=headless)
        ctx_opts = {}
        if downloads_path:
            ctx_opts['accept_downloads'] = True
            ctx_opts['downloads_path'] = downloads_path
        self.context = self.browser.new_context(**ctx_opts)
        self.page = self.context.new_page()
        # Dismiss dialogs automatically for safety
        try:
            self.page.on('dialog', lambda d: (d.dismiss(), logger.info(f'dialog dismissed: {d.message}')))
        except Exception:
            pass
        logger.info(f'Playwright started (chromium headless={headless})')

    def stop(self):
        with contextlib.suppress(Exception):
            if self.page:
                self.page.close()
            if self.context:
                self.context.close()
            if self.browser:
                self.browser.close()
            if self._playwright:
                self._playwright.stop()
        self._playwright = None
        self.browser = None
        self.context = None
        self.page = None
        logger.info('Playwright stopped')

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.stop()

    @retry(reraise=True, stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, min=0.5, max=4))
    def goto(self, url: str, timeout_ms: int = 15000):
        if not self.security.is_domain_allowed(url):
            raise PermissionError(f'Navigation blocked by security policy: {url}')
        if not self.security.enforce_rate_limit(url):
            raise RuntimeError('Rate limit exceeded, retry later')
        self.page.goto(url, timeout=timeout_ms, wait_until='domcontentloaded')
        logger.info(f'Navigated to {url}')

    @retry(reraise=True, stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, min=0.5, max=4))
    def click(self, selector: str, timeout_ms: int = 10000):
        self.page.wait_for_selector(selector, timeout=timeout_ms, state='visible')
        self.page.click(selector, timeout=timeout_ms)
        logger.info(f'Clicked {selector}')

    def click_best(self, target: str, timeout_ms: int = 10000):
        # First try known good selectors for this host+label
        try:
            host = self.page.url.split('/')[2] if self.page and self.page.url else ''
        except Exception:
            host = ''
        tried = []
        if host:
            for sel in self.sel_mem.get(host, 'click', target)[:5]:
                try:
                    self.page.wait_for_selector(sel, timeout=timeout_ms, state='visible')
                    self.page.click(sel, timeout=timeout_ms)
                    logger.info(f'Clicked from memory: {sel}')
                    return
                except Exception:
                    tried.append(sel)
        # Try CSS first
        try:
            self.page.wait_for_selector(target, timeout=timeout_ms, state='visible')
            self.page.click(target, timeout=timeout_ms)
            logger.info(f'Clicked CSS: {target}')
            # Save successful selector
            if host:
                self.sel_mem.save_success(host, 'click', target, target)
            return
        except Exception:
            pass
        # Try role=button by name
        try:
            self.page.get_by_role('button', name=target, exact=False).first.click(timeout=timeout_ms)
            logger.info(f"Clicked role=button name='{target}'")
            if host:
                self.sel_mem.save_success(host, 'click', target, f"role=button,name={target}")
            return
        except Exception:
            pass
        # Try semantic candidate -> use text locator
        try:
            cand = self._semantic_candidate('click', target)
            if cand:
                self.page.get_by_text(cand, exact=False).first.click(timeout=timeout_ms)
                logger.info(f"Clicked by semantic text '{cand}'")
                if host:
                    self.sel_mem.save_success(host, 'click', target, f"semantic_text={cand}")
                return
        except Exception:
            pass
        # Try text locator
        try:
            self.page.get_by_text(target, exact=False).first.click(timeout=timeout_ms)
            logger.info(f"Clicked by text '{target}'")
            if host:
                self.sel_mem.save_success(host, 'click', target, f"text={target}")
            return
        except Exception as e:
            logger.error(f'All click strategies failed for {target}: {e}; tried={tried}')
            raise

    @retry(reraise=True, stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, min=0.5, max=4))
    def type(self, selector: str, text: str, timeout_ms: int = 10000):
        stext = self.security.sanitize_input(text)
        self.page.wait_for_selector(selector, timeout=timeout_ms, state='visible')
        self.page.fill(selector, stext, timeout=timeout_ms)
        logger.info(f'Typed into {selector}')

    def type_best(self, field: str, text: str, timeout_ms: int = 10000):
        stext = self.security.sanitize_input(text)
        try:
            host = self.page.url.split('/')[2] if self.page and self.page.url else ''
        except Exception:
            host = ''
        tried = []
        # Try memory selectors first
        if host:
            for sel in self.sel_mem.get(host, 'type', field)[:5]:
                try:
                    self.page.wait_for_selector(sel, timeout=timeout_ms, state='visible')
                    self.page.fill(sel, stext, timeout=timeout_ms)
                    logger.info(f'Filled from memory {sel}')
                    return
                except Exception:
                    tried.append(sel)
        # Try CSS selector
        try:
            self.page.wait_for_selector(field, timeout=timeout_ms, state='visible')
            self.page.fill(field, stext, timeout=timeout_ms)
            logger.info(f'Filled CSS {field}')
            if host:
                self.sel_mem.save_success(host, 'type', field, field)
            return
        except Exception:
            pass
        # Try by placeholder or label
        try:
            self.page.get_by_placeholder(field).first.fill(stext, timeout=timeout_ms)
            logger.info(f'Filled by placeholder {field}')
            if host:
                self.sel_mem.save_success(host, 'type', field, f"placeholder={field}")
            return
        except Exception:
            pass
        try:
            self.page.get_by_label(field, exact=False).first.fill(stext, timeout=timeout_ms)
            logger.info(f'Filled by label {field}')
            if host:
                self.sel_mem.save_success(host, 'type', field, f"label={field}")
            return
        except Exception:
            pass
        # Try semantic candidate -> choose label/placeholder by similarity then type
        try:
            cand = self._semantic_candidate('type', field)
            if cand:
                try:
                    self.page.get_by_placeholder(cand).first.fill(stext, timeout=timeout_ms)
                    logger.info(f"Filled by semantic placeholder '{cand}'")
                    if host:
                        self.sel_mem.save_success(host, 'type', field, f"semantic_placeholder={cand}")
                    return
                except Exception:
                    pass
                self.page.get_by_label(cand, exact=False).first.fill(stext, timeout=timeout_ms)
                logger.info(f"Filled by semantic label '{cand}'")
                if host:
                    self.sel_mem.save_success(host, 'type', field, f"semantic_label={cand}")
                return
        except Exception as e:
            logger.error(f'All type strategies failed for {field}: {e}; tried={tried}')
            raise

    def extract_text(self, selector: str, timeout_ms: int = 10000) -> str:
        try:
            self.page.wait_for_selector(selector, timeout=timeout_ms, state='attached')
            el = self.page.query_selector(selector)
            txt = el.inner_text() if el else ''
            logger.info(f'Extracted text from {selector}')
            return txt
        except PWTimeoutError:
            logger.error(f'Timeout extracting selector: {selector}')
            return ''

    # Semantic resolver: pick best candidate label/text using a simple vector store
    def _semantic_candidate(self, mode: str, query: str) -> str | None:
        try:
            if mode == 'click':
                handles = self.page.query_selector_all("button, a, [role=button], [type=submit]")
            else:
                handles = self.page.query_selector_all("input, textarea, [contenteditable=true]")
            docs = []
            metas = []
            for h in handles[:200]:
                try:
                    txt = (h.inner_text() or '').strip()
                except Exception:
                    txt = ''
                attrs = []
                for k in ['aria-label', 'placeholder', 'name', 'id', 'title', 'value']:
                    try:
                        v = h.get_attribute(k)
                        if v:
                            attrs.append(v)
                    except Exception:
                        pass
                doc = ' '.join(x for x in [txt] + attrs if x)
                if not doc:
                    continue
                docs.append(doc)
                metas.append({'text': txt, 'attrs': attrs})
            if not docs:
                return None
            vs = SimpleVectorStore()
            vs.add_texts(docs)
            ranked = vs.similarity_search(query, k=1)
            best = ranked[0][0] if ranked else None
            return best
        except Exception:
            return None

    def scroll(self, pixels: int = 800):
        try:
            self.page.mouse.wheel(0, pixels)
            logger.info(f'scrolled:{pixels}')
        except Exception as e:
            logger.error(f'scroll failed: {e}')

    def screenshot(self, path: str):
        try:
            self.page.screenshot(path=path, full_page=True)
            logger.info(f'screenshot:{path}')
        except Exception as e:
            logger.error(f'screenshot failed: {e}')

    def snapshot_dom(self, max_len: int = 50000) -> str:
        html = self.page.content()
        return html[:max_len]


    def open_new_tab(self, url: str):
        p = self.context.new_page()
        self.page = p
        self.goto(url)
        logger.info(f'new_tab_opened:{url}')

    def switch_to_tab(self, idx: int = 0):
        pages = self.context.pages
        if 0 <= idx < len(pages):
            self.page = pages[idx]
            logger.info(f'switched_tab:{idx}')
        else:
            logger.error(f'switch_tab_invalid_index:{idx}')

    def upload_file(self, selector: str, file_path: str, timeout_ms: int = 15000):
        import os as _os
        if not _os.path.exists(file_path):
            raise FileNotFoundError(file_path)
        self.page.wait_for_selector(selector, timeout=timeout_ms, state='visible')
        self.page.set_input_files(selector, file_path)
        logger.info(f'upload:{file_path} -> {selector}')
