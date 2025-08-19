from __future__ import annotations
from tenacity import retry, stop_after_attempt, wait_exponential

# Retry decorator factory

def retryable():
    return retry(reraise=True, stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, min=0.5, max=4))
