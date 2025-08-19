import logging
import os
from logging import Logger

_DEF_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"

_cache: dict[str, Logger] = {}

def get_logger(name: str) -> Logger:
    if name in _cache:
        return _cache[name]
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(_DEF_FORMAT)
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        # also write to file
        try:
            pkg_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
            log_path = os.path.join(pkg_root, 'runtime.log')
            fh = logging.FileHandler(log_path, encoding='utf-8')
            fh.setFormatter(formatter)
            logger.addHandler(fh)
        except Exception:
            pass
        logger.setLevel(logging.INFO)
    _cache[name] = logger
    return logger
