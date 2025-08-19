from __future__ import annotations
import base64
from cryptography.fernet import Fernet
from hashlib import pbkdf2_hmac

_DEF_SALT = b'agentx-salt-v1'

class Crypto:
    def __init__(self, password: str):
        key = pbkdf2_hmac('sha256', password.encode(), _DEF_SALT, 390000, dklen=32)
        self.fernet = Fernet(base64.urlsafe_b64encode(key))

    def encrypt(self, data: bytes) -> bytes:
        return self.fernet.encrypt(data)

    def decrypt(self, token: bytes) -> bytes:
        return self.fernet.decrypt(token)
