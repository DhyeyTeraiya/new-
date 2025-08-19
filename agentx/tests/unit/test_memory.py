from agentx.memory.storage import MemoryManager

def test_memory_roundtrip(tmp_path):
    db = tmp_path / 'mem.sqlite3'
    mm = MemoryManager(str(db))
    rid = mm.create_run('demo')
    mm.add_step(rid, 1, 'open', 'ok')
    mm.add_artifact(rid, 'a.txt', 'hello')
    ctx = mm.recent_context()
    assert 'Goal: demo' in ctx
