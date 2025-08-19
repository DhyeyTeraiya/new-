from __future__ import annotations
import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    openai_api_key: str | None = os.getenv('OPENAI_API_KEY')
    openai_model: str = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')
    anthropic_api_key: str | None = os.getenv('ANTHROPIC_API_KEY')
    anthropic_model: str = os.getenv('ANTHROPIC_MODEL', 'claude-3-5-sonnet-20240620')

    allowed_domains: list[str] = [d.strip() for d in os.getenv('ALLOWED_DOMAINS', '').split(',') if d.strip()]
    cookie_whitelist: list[str] = [c.strip() for c in os.getenv('COOKIE_WHITELIST', '').split(',') if c.strip()]
    rate_limit_per_min: int = int(os.getenv('RATE_LIMIT_PER_MIN', '60'))

    enc_password: str = os.getenv('ENC_PASSWORD', 'change_me')

    @property
    def has_llm(self) -> bool:
        return bool(self.openai_api_key or self.anthropic_api_key)

settings = Settings()
