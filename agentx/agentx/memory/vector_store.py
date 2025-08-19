from __future__ import annotations
import re
import math
from typing import List, Tuple

class SimpleVectorStore:
    def __init__(self, dim: int = 512):
        self.dim = dim
        self.docs: list[str] = []
        self.vecs: list[list[float]] = []

    def _hash(self, token: str) -> int:
        return (hash(token) % self.dim + self.dim) % self.dim

    def _embed(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        for t in re.findall(r'[a-zA-Z0-9]+', text.lower()):
            v[self._hash(t)] += 1.0
        norm = math.sqrt(sum(x*x for x in v)) or 1.0
        return [x / norm for x in v]

    def add_texts(self, texts: List[str]):
        for t in texts:
            self.docs.append(t)
            self.vecs.append(self._embed(t))

    def similarity_search(self, query: str, k: int = 3) -> List[Tuple[str, float]]:
        q = self._embed(query)
        scores = []
        for i, v in enumerate(self.vecs):
            s = sum(a*b for a,b in zip(q, v))
            scores.append((i, s))
        scores.sort(key=lambda x: x[1], reverse=True)
        return [(self.docs[i], score) for i, score in scores[:k]]
