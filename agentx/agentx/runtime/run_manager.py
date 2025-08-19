from __future__ import annotations
from dataclasses import dataclass, field
from threading import Thread, Event
from typing import Optional, Callable
from ..logging.logger import get_logger

logger = get_logger('runmgr')

@dataclass
class RunState:
    goal: str = ''
    running: bool = False
    stop_event: Event = field(default_factory=Event)
    thread: Optional[Thread] = None
    last_result: Optional[dict] = None

class RunManager:
    def __init__(self):
        self.state = RunState()

    def start(self, target: Callable[[], dict]):
        if self.state.running:
            logger.warning('A run is already in progress')
            return False
        self.state.stop_event.clear()
        self.state.running = True
        def _runner():
            try:
                self.state.last_result = target()
            except Exception as e:
                logger.error(f'Run error: {e}')
                self.state.last_result = {'error': str(e)}
            finally:
                self.state.running = False
        t = Thread(target=_runner, daemon=True)
        self.state.thread = t
        t.start()
        return True

    def stop(self):
        if self.state.running:
            self.state.stop_event.set()
            logger.info('Stop requested')

    def should_stop(self) -> bool:
        return self.state.stop_event.is_set()

run_manager = RunManager()
