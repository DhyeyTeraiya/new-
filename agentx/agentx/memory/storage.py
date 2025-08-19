from __future__ import annotations
import os
import sqlite3
import time
from dataclasses import dataclass

from ..config import settings
from .encrypt import Crypto

_DB_PATH = os.path.join(os.path.dirname(__file__), 'memory.sqlite3')
_JSON_PATH = os.path.join(os.path.dirname(__file__), 'memory.json')

@dataclass
class SensitiveDataStore:
    crypto: Crypto

    def save(self, key: str, value: str):
        enc = self.crypto.encrypt(value.encode())
        with open(_JSON_PATH + '.secrets', 'ab') as f:
            f.write(len(key).to_bytes(2, 'big'))
            f.write(key.encode())
            f.write(len(enc).to_bytes(4, 'big'))
            f.write(enc)

class MemoryManager:
    def __init__(self, db_path: str = _DB_PATH):
        self.db_path = db_path
        self.crypto = Crypto(settings.enc_password)
        self._ensure()

    def _ensure(self):
        con = sqlite3.connect(self.db_path)
        cur = con.cursor()
        cur.execute('CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, goal TEXT, created REAL)')
        cur.execute("""
            CREATE TABLE IF NOT EXISTS steps (
                id INTEGER PRIMARY KEY,
                run_id INTEGER,
                idx INTEGER,
                action TEXT,
                observation TEXT,
                created REAL
            )
        """)
        cur.execute('CREATE TABLE IF NOT EXISTS artifacts (id INTEGER PRIMARY KEY, run_id INTEGER, name TEXT, data TEXT)')
        con.commit(); con.close()

    def create_run(self, goal: str) -> int:
        con = sqlite3.connect(self.db_path); cur = con.cursor()
        cur.execute('INSERT INTO runs(goal, created) VALUES(?, ?)', (goal, time.time()))
        run_id = cur.lastrowid
        con.commit(); con.close()
        return run_id

    def add_step(self, run_id: int, idx: int, action: str, observation: str):
        con = sqlite3.connect(self.db_path); cur = con.cursor()
        cur.execute('INSERT INTO steps(run_id, idx, action, observation, created) VALUES(?,?,?,?,?)',
                    (run_id, idx, action, observation, time.time()))
        con.commit(); con.close()

    def add_artifact(self, run_id: int, name: str, data: str):
        con = sqlite3.connect(self.db_path); cur = con.cursor()
        cur.execute('INSERT INTO artifacts(run_id, name, data) VALUES(?,?,?)', (run_id, name, data))
        con.commit(); con.close()

    def recent_context(self, limit: int = 5) -> str:
        con = sqlite3.connect(self.db_path); cur = con.cursor()
        cur.execute('SELECT goal FROM runs ORDER BY id DESC LIMIT 1')
        row = cur.fetchone()
        last_goal = row[0] if row else ''
        cur.execute('SELECT action, observation FROM steps ORDER BY id DESC LIMIT ?', (limit,))
        pairs = cur.fetchall(); con.close()
        ctx = [f'Goal: {last_goal}'] + [f'{a} -> {o}' for a,o in pairs[::-1]]
        return '\n'.join(ctx)
