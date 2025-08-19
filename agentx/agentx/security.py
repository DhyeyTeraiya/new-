from __future__ import annotations
import re
import time
from dataclasses import dataclass, field
from typing import Dict
from urllib.parse import urlparse

from .config import settings
from .logging.logger import get_logger

logger = get_logger('security')

class TokenBucket:
    def __init__(self, capacity: int, refill_rate_per_sec: float):
        self.capacity = capacity
        self.tokens = capacity
        self.refill_rate = refill_rate_per_sec
        self.last_refill = time.time()

    def consume(self, tokens: int = 1) -> bool:
        now = time.time()
        elapsed = now - self.last_refill
        refill = elapsed * self.refill_rate
        if refill > 0:
            self.tokens = min(self.capacity, self.tokens + refill)
            self.last_refill = now
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False

@dataclass
class SecurityManager:
    allowed_domains: list[str] = field(default_factory=lambda: settings.allowed_domains)
    cookie_whitelist: list[str] = field(default_factory=lambda: settings.cookie_whitelist)
    rate_limit_per_min: int = settings.rate_limit_per_min
    buckets: Dict[str, TokenBucket] = field(default_factory=dict)

    def sanitize_input(self, s: str) -> str:
        # Block common JS-injection patterns
        if re.search(r'<script|javascript:|onerror=|onload=', s, re.IGNORECASE):
            logger.warning('Sanitized potentially unsafe input')
            return re.sub(r'<|>', '', s)
        return s

    def is_domain_allowed(self, url: str) -> bool:
        host = urlparse(url).netloc
        allowed = any(host.endswith(d) for d in self.allowed_domains)
        if not allowed:
            logger.error(f'Blocked navigation to non-allowed domain: {host}')
        return allowed

    def filter_cookies(self, cookies: list[dict]) -> list[dict]:
        if not self.cookie_whitelist:
            return []
        return [c for c in cookies if c.get('name') in self.cookie_whitelist]

    def _bucket_for(self, origin: str) -> TokenBucket:
        if origin not in self.buckets:
            self.buckets[origin] = TokenBucket(
                capacity=max(1, self.rate_limit_per_min),
                refill_rate_per_sec=max(1, self.rate_limit_per_min) / 60.0,
            )
        return self.buckets[origin]

    def enforce_rate_limit(self, url: str) -> bool:
        p = urlparse(url)
        origin = f"{p.scheme}://{p.netloc}"
        bucket = self._bucket_for(origin)
        allowed = bucket.consume(1)
        if not allowed:
            logger.warning(f'Rate limit exceeded for origin: {origin}')
        return allowed
