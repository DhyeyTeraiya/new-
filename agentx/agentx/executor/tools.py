from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from .web_navigator import WebNavigator
from ..logging.logger import get_logger
from ..permissions import PermissionManager

logger = get_logger('tools')

@dataclass
class Action:
    kind: str
    a: Optional[str] = None
    b: Optional[str] = None
    n: Optional[int] = None

# Very small DSL: open(url), click("label or selector"), type("text","field"), wait(ms), scroll(px), extract("selector"), upload("selector","filepath"), new_tab(url), switch_tab(n)

def parse_action(step: str) -> Action | None:
    s = step.strip()
    if '(' not in s or not s.endswith(')'):
        return None
    name, rest = s.split('(', 1)
    name = name.strip().lower()
    args = rest[:-1]  # drop ')'
    parts = []
    cur = ''
    in_q = False
    i = 0
    while i < len(args):
        ch = args[i]
        if ch == '"':
            in_q = not in_q
            i += 1
            continue
        if ch == ',' and not in_q:
            parts.append(cur.strip())
            cur = ''
            i += 1
            continue
        cur += ch
        i += 1
    if cur:
        parts.append(cur.strip())

    def u(x: str) -> str:
        return x.strip().strip('"')

    if name == 'open' or name == 'open_url':
        return Action('open', a=u(parts[0]) if parts else None)
    if name == 'click':
        return Action('click', a=u(parts[0]) if parts else None)
    if name == 'type' or name == 'fill':
        return Action('type', a=u(parts[0]) if parts else '', b=u(parts[1]) if len(parts) > 1 else 'input, textarea')
    if name == 'wait':
        try:
            ms = int(u(parts[0]))
        except Exception:
            ms = 1000
        return Action('wait', n=ms)
    if name == 'scroll':
        try:
            px = int(u(parts[0]))
        except Exception:
            px = 800
        return Action('scroll', n=px)
    if name == 'extract':
        return Action('extract', a=u(parts[0]) if parts else 'title')
    if name == 'upload':
        return Action('upload', a=u(parts[0]) if parts else 'input[type=file]', b=u(parts[1]) if len(parts) > 1 else '')
    if name == 'new_tab':
        return Action('new_tab', a=u(parts[0]) if parts else None)
    if name == 'switch_tab':
        try:
            idx = int(u(parts[0]))
        except Exception:
            idx = 0
        return Action('switch_tab', n=idx)
    return None

class Tools:
    def __init__(self, nav: WebNavigator, perms: PermissionManager | None = None):
        self.nav = nav
        self.perms = perms or PermissionManager()

    def apply(self, act: Action) -> str:
        k = act.kind
        if k == 'open':
            url = act.a or 'https://example.com'
            self.nav.goto(url)
            return f'navigated:{url}'
        if k == 'click':
            target = act.a or 'a, button'
            if hasattr(self.nav, 'click_best'):
                self.nav.click_best(target)
            else:
                self.nav.click(target)
            return f'clicked:{target}'
        if k == 'type':
            text = act.a or ''
            field = act.b or 'input, textarea'
            if hasattr(self.nav, 'type_best'):
                self.nav.type_best(field, text)
            else:
                self.nav.type(field, text)
            return f'typed:{text} into:{field}'
        if k == 'wait':
            import time
            time.sleep((act.n or 1000) / 1000.0)
            return f'waited_ms:{act.n or 1000}'
        if k == 'scroll':
            self.nav.scroll(act.n or 800)
            return f'scrolled:{act.n or 800}'
        if k == 'extract':
            sel = act.a or 'title'
            txt = self.nav.extract_text(sel)
            return f'extract:{sel}:{txt}'
        if k == 'upload':
            if not self.perms.check('upload'):
                return 'blocked:upload'
            sel = act.a or 'input[type=file]'
            path = act.b or ''
            self.nav.upload_file(sel, path)
            return f'uploaded:{path} into:{sel}'
        if k == 'new_tab':
            url = act.a or 'about:blank'
            self.nav.open_new_tab(url)
            return f'new_tab:{url}'
        if k == 'switch_tab':
            self.nav.switch_to_tab(act.n or 0)
            return f'switched_tab:{act.n or 0}'
        return f'noop:{act.kind}'
