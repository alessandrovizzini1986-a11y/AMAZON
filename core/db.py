"""Archivio dati con backend selezionato automaticamente.

- Se è configurata una connessione Postgres (``DATABASE_URL`` via variabile
  d'ambiente oppure ``database_url`` in ``st.secrets``), usa **Postgres**: è il
  caso del deploy online (es. Neon), dove il filesystem è effimero e SQLite
  verrebbe azzerato a ogni riavvio.
- Altrimenti usa **SQLite** locale (file ``data/gestionale.db``), comodo per lo
  sviluppo sul proprio computer. Percorso personalizzabile con ``DB_PATH``.

Tutto l'accesso ai dati passa da qui, così la differenza fra i due backend
(placeholder, upsert, id auto-generato) resta confinata in questo file.
"""
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

DB_PATH = os.environ.get(
    "DB_PATH",
    str(Path(__file__).resolve().parent.parent / "data" / "gestionale.db"),
)

_SCHEMA_SQLITE = [
    """
    CREATE TABLE IF NOT EXISTS forecast_snapshot (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        source_filename TEXT,
        uploaded_at     TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS forecast_row (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES forecast_snapshot(id) ON DELETE CASCADE,
        key         TEXT NOT NULL,
        value       REAL,
        UNIQUE(snapshot_id, key)
    )
    """,
]

_SCHEMA_POSTGRES = [
    """
    CREATE TABLE IF NOT EXISTS forecast_snapshot (
        id              BIGSERIAL PRIMARY KEY,
        name            TEXT NOT NULL,
        source_filename TEXT,
        uploaded_at     TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS forecast_row (
        id          BIGSERIAL PRIMARY KEY,
        snapshot_id BIGINT NOT NULL REFERENCES forecast_snapshot(id) ON DELETE CASCADE,
        key         TEXT NOT NULL,
        value       DOUBLE PRECISION,
        UNIQUE(snapshot_id, key)
    )
    """,
]


def current_backend() -> str:
    """Backend attivo: 'postgres' se è configurata una connessione, altrimenti 'sqlite'."""
    return "postgres" if _database_url() else "sqlite"


def _database_url():
    """URL Postgres se configurato, altrimenti None (-> SQLite)."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    try:
        import streamlit as st

        if "database_url" in st.secrets:
            return st.secrets["database_url"]
    except Exception:
        pass
    return None


@contextmanager
def _connect():
    """Apre la connessione al backend attivo. Restituisce (backend, conn)."""
    url = _database_url()
    if url:
        import psycopg

        conn = psycopg.connect(url)
        try:
            yield "postgres", conn
            conn.commit()
        finally:
            conn.close()
    else:
        Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield "sqlite", conn
            conn.commit()
        finally:
            conn.close()


def init_db():
    with _connect() as (backend, conn):
        schema = _SCHEMA_POSTGRES if backend == "postgres" else _SCHEMA_SQLITE
        cur = conn.cursor()
        for stmt in schema:
            cur.execute(stmt)


def save_snapshot(name: str, filename: str, items) -> int:
    """Salva uno snapshot e le sue righe (key, value). Ritorna l'id."""
    rows = [(str(k), float(v)) for k, v in items]
    uploaded_at = datetime.now().isoformat(timespec="seconds")
    with _connect() as (backend, conn):
        cur = conn.cursor()
        if backend == "postgres":
            cur.execute(
                "INSERT INTO forecast_snapshot (name, source_filename, uploaded_at) "
                "VALUES (%s, %s, %s) RETURNING id",
                (name, filename, uploaded_at),
            )
            sid = cur.fetchone()[0]
            cur.executemany(
                "INSERT INTO forecast_row (snapshot_id, key, value) VALUES (%s, %s, %s) "
                "ON CONFLICT (snapshot_id, key) DO UPDATE SET value = EXCLUDED.value",
                [(sid, k, v) for k, v in rows],
            )
        else:
            cur.execute(
                "INSERT INTO forecast_snapshot (name, source_filename, uploaded_at) "
                "VALUES (?, ?, ?)",
                (name, filename, uploaded_at),
            )
            sid = cur.lastrowid
            cur.executemany(
                "INSERT OR REPLACE INTO forecast_row (snapshot_id, key, value) "
                "VALUES (?, ?, ?)",
                [(sid, k, v) for k, v in rows],
            )
    return sid


def list_snapshots():
    """Lista snapshot (id, name, source_filename, uploaded_at), più recenti prima."""
    with _connect() as (_backend, conn):
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, source_filename, uploaded_at "
            "FROM forecast_snapshot ORDER BY id DESC"
        )
        return cur.fetchall()


def load_rows(sid: int):
    """Righe (key, value) di uno snapshot."""
    with _connect() as (backend, conn):
        cur = conn.cursor()
        ph = "%s" if backend == "postgres" else "?"
        cur.execute(
            f"SELECT key, value FROM forecast_row WHERE snapshot_id = {ph}", (sid,)
        )
        return cur.fetchall()


def delete_snapshot(sid: int):
    with _connect() as (backend, conn):
        cur = conn.cursor()
        ph = "%s" if backend == "postgres" else "?"
        cur.execute(f"DELETE FROM forecast_snapshot WHERE id = {ph}", (sid,))
