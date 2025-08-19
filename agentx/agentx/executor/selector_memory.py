from __future__ import annotations
import os
import sqlite3
import time
from dataclasses import dataclass
from typing import List

_DB_DEFAULT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'memory', 'memory.sqlite3'))

@dataclass
class SelectorMemory:
    db_path: str = _DB_DEFAULT

    def _ensure(self):
        con = sqlite3.connect(self.db_path)
        cur = con.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS selectors (
                id INTEGER PRIMARY KEY,
                host TEXT,
                action TEXT,
                label TEXT,
                selector TEXT,
                success_count INTEGER DEFAULT 1,
                updated REAL
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_sel_h_a_l ON selectors(host, action, label)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_sel_h_sel ON selectors(host, selector)")
        con.commit(); con.close()

    def get(self, host: str, action: str, label: str) -> List[str]:
        self._ensure()
        con = sqlite3.connect(self.db_path); cur = con.cursor()
        cur.execute(
            "SELECT selector FROM selectors WHERE host=? AND action=? AND label=? ORDER BY success_count DESC, updated DESC",
            (host, action, label),
        )
        rows = cur.fetchall(); con.close()
        return [r[0] for r in rows]

    def save_success(self, host: str, action: str, label: str, selector: str):
        self._ensure()
        con = sqlite3.connect(self.db_path); cur = con.cursor()
        cur.execute(
            "SELECT id, success_count FROM selectors WHERE host=? AND action=? AND label=? AND selector=?",
            (host, action, label, selector),
        )
        row = cur.fetchone()
        if row:
            sid, cnt = row
            cur.execute("UPDATE selectors SET success_count=?, updated=? WHERE id=?", (cnt + 1, time.time(), sid))
        else:
            cur.execute(
                "INSERT INTO selectors(host, action, label, selector, success_count, updated) VALUES(?,?,?,?,?,?)",
                (host, action, label, selector, 1, time.time()),
            )
        con.commit(); con.close()
