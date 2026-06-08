"""Archivio dati su SQLite. Percorso configurabile via env DB_PATH."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = os.environ.get(
    "DB_PATH",
    str(Path(__file__).resolve().parent.parent / "data" / "gestionale.db"),
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS forecast_snapshot (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    source_filename TEXT,
    uploaded_at     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS forecast_row (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES forecast_snapshot(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value       REAL,
    UNIQUE(snapshot_id, key)
);
"""


@contextmanager
def get_conn():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)
