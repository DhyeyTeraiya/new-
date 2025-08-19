from __future__ import annotations
from dataclasses import dataclass
import os
from .logging.logger import get_logger

logger = get_logger('perm')

@dataclass
class PermissionPolicy:
    allow_login: bool = bool(os.getenv('ALLOW_LOGIN', ''))
    allow_upload: bool = bool(os.getenv('ALLOW_UPLOAD', ''))
    allow_off_allowlist: bool = False
    auto_approve: bool = False

class PermissionManager:
    def __init__(self, policy: PermissionPolicy | None = None):
        self.policy = policy or PermissionPolicy()

    def check(self, action: str, context: dict | None = None) -> bool:
        ctx = context or {}
        if action == 'login':
            ok = self.policy.allow_login or self.policy.auto_approve
            if not ok:
                logger.warning('Blocked login action by policy')
            return ok
        if action == 'upload':
            ok = self.policy.allow_upload or self.policy.auto_approve
            if not ok:
                logger.warning('Blocked upload action by policy')
            return ok
        if action == 'off-allowlist':
            ok = self.policy.allow_off_allowlist or self.policy.auto_approve
            if not ok:
                logger.warning('Blocked off-allowlist navigation by policy')
            return ok
        return True
