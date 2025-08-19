from __future__ import annotations
import os
import sqlite3
import time
from typing import Optional

_DB_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'memory', 'memory.sqlite3'))

class Recorder:
    def __init__(self, db_path: str = _DB_PATH):
        self.db_path = db_path
        self.rec_id: Optional[int] = None
        self._ensure()

    def _ensure(self):
        con = sqlite3.connect(self.db_path)
        cur = con.cursor()
        cur.execute('CREATE TABLE IF NOT EXISTS recordings (id INTEGER PRIMARY KEY, name TEXT, created REAL)')
        cur.execute(
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY,
                rec_id INTEGER,
                idx INTEGER,
                action TEXT,
                params TEXT,
                created REAL
            )
        )
        con.commit(); con.close()

    def start(self, name: str) -> int:
        con = sqlite3.connect(self.db_path)
        cur = con.cursor()
        cur.execute('INSERT INTO recordings(name, created) VALUES(?, ?)', (name, time.time()))
        self.rec_id = cur.lastrowid
        con.commit(); con.close()
        return int(self.rec_id)

    def log_event(self, idx: int, action: str, params: str):
        if self.rec_id is None:
            return
        con = sqlite3.connect(self.db_path)
        cur = con.cursor()
        cur.execute('INSERT INTO events(rec_id, idx, action, params, created) VALUES(?,?,?,?,?)', (self.rec_id, idx, action, params, time.time()))
        con.commit(); con.close()

    def stop(self):
        self.rec_id = None
