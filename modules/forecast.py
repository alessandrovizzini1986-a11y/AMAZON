"""Modulo Forecast: carica file CSV/XLS/XLSX, salva snapshot e confronta
due periodi calcolando lo scostamento in valore assoluto e percentuale.
"""
from datetime import datetime

import pandas as pd
import streamlit as st

from core.db import get_conn


# --------------------------- Lettura file ---------------------------
def _read_file(uploaded) -> pd.DataFrame:
    name = uploaded.name.lower()
    if name.endswith(".csv"):
        return pd.read_csv(uploaded)
    if name.endswith(".xlsx"):
        return pd.read_excel(uploaded, engine="openpyxl")
    if name.endswith(".xls"):
        return pd.read_excel(uploaded)
    raise ValueError("Formato non supportato. Usa CSV, XLS o XLSX.")


# --------------------------- Accesso dati ---------------------------
def _save_snapshot(name: str, filename: str, items) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO forecast_snapshot (name, source_filename, uploaded_at) "
            "VALUES (?, ?, ?)",
            (name, filename, datetime.now().isoformat(timespec="seconds")),
        )
        sid = cur.lastrowid
        conn.executemany(
            "INSERT OR REPLACE INTO forecast_row (snapshot_id, key, value) "
            "VALUES (?, ?, ?)",
            [(sid, str(k), float(v)) for k, v in items],
        )
    return sid


def _list_snapshots():
    with get_conn() as conn:
        return conn.execute(
            "SELECT id, name, source_filename, uploaded_at "
            "FROM forecast_snapshot ORDER BY id DESC"
        ).fetchall()


def _load_rows(sid: int) -> pd.DataFrame:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT key, value FROM forecast_row WHERE snapshot_id = ?", (sid,)
        ).fetchall()
    return pd.DataFrame(rows, columns=["chiave", "valore"])


def _delete_snapshot(sid: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM forecast_snapshot WHERE id = ?", (sid,))


# --------------------------- UI ---------------------------
def render():
    st.header("📈 Forecast")
    tab_up, tab_cmp, tab_arch = st.tabs(["Carica", "Confronta", "Archivio"])
    with tab_up:
        _render_upload()
    with tab_cmp:
        _render_compare()
    with tab_arch:
        _render_archive()


def _render_upload():
    f = st.file_uploader("File forecast (CSV / XLS / XLSX)", type=["csv", "xls", "xlsx"])
    if not f:
        return
    try:
        df = _read_file(f)
    except Exception as e:  # formato/parse error -> messaggio leggibile
        st.error(str(e))
        return

    st.caption("Anteprima (prime 20 righe):")
    st.dataframe(df.head(20), use_container_width=True)

    cols = list(df.columns)
    key_cols = st.multiselect(
        "Colonne chiave — identificano la voce da confrontare (es. Voce, Station)", cols
    )
    num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c])]
    if not num_cols:
        st.warning("Nessuna colonna numerica trovata: non posso calcolare i valori.")
        return
    value_col = st.selectbox("Colonna valore (numerica)", num_cols)

    default_name = f"{f.name} — {datetime.now():%Y-%m-%d}"
    name = st.text_input("Nome snapshot", value=default_name)

    can_save = bool(key_cols and value_col and name)
    if st.button("💾 Salva snapshot", disabled=not can_save):
        work = df[key_cols + [value_col]].copy()
        work["__key__"] = work[key_cols].astype(str).agg(" | ".join, axis=1)
        grouped = work.groupby("__key__")[value_col].sum()
        sid = _save_snapshot(name, f.name, list(grouped.items()))
        st.success(f"Snapshot salvato (id {sid}) — {len(grouped)} voci aggregate.")


def _render_compare():
    snaps = _list_snapshots()
    if len(snaps) < 2:
        st.info("Servono almeno due snapshot salvati per confrontare.")
        return

    labels = {f"[{r[0]}] {r[1]}": r[0] for r in snaps}
    keys = list(labels.keys())
    c1, c2 = st.columns(2)
    prev_label = c1.selectbox("Precedente", keys, index=min(1, len(keys) - 1))
    curr_label = c2.selectbox("Attuale", keys, index=0)
    prev_id, curr_id = labels[prev_label], labels[curr_label]
    if prev_id == curr_id:
        st.warning("Seleziona due snapshot diversi.")
        return

    prev = _load_rows(prev_id).rename(columns={"valore": "precedente"})
    curr = _load_rows(curr_id).rename(columns={"valore": "attuale"})
    merged = pd.merge(prev, curr, on="chiave", how="outer")
    merged[["precedente", "attuale"]] = merged[["precedente", "attuale"]].fillna(0.0)
    merged["scostamento"] = merged["attuale"] - merged["precedente"]
    merged["scostamento_%"] = merged.apply(
        lambda r: (r["scostamento"] / r["precedente"] * 100) if r["precedente"] else pd.NA,
        axis=1,
    )
    merged = merged.sort_values("scostamento", key=abs, ascending=False)

    tot_prev = merged["precedente"].sum()
    tot_curr = merged["attuale"].sum()
    delta = tot_curr - tot_prev
    delta_pct = (delta / tot_prev * 100) if tot_prev else float("nan")

    m1, m2, m3 = st.columns(3)
    m1.metric("Totale precedente", f"{tot_prev:,.2f}")
    m2.metric("Totale attuale", f"{tot_curr:,.2f}")
    m3.metric("Scostamento", f"{delta:,.2f}", f"{delta_pct:+.1f}%")

    st.dataframe(
        merged,
        use_container_width=True,
        column_config={
            "precedente": st.column_config.NumberColumn(format="%.2f"),
            "attuale": st.column_config.NumberColumn(format="%.2f"),
            "scostamento": st.column_config.NumberColumn(format="%.2f"),
            "scostamento_%": st.column_config.NumberColumn(format="%.1f%%"),
        },
    )
    st.download_button(
        "⬇️ Scarica confronto (CSV)",
        merged.to_csv(index=False).encode("utf-8"),
        file_name="confronto_forecast.csv",
        mime="text/csv",
    )


def _render_archive():
    snaps = _list_snapshots()
    if not snaps:
        st.info("Nessuno snapshot salvato.")
        return
    for sid, name, filename, uploaded_at in snaps:
        c1, c2 = st.columns([5, 1])
        c1.write(f"**[{sid}] {name}**  \n_{filename or '—'} · {uploaded_at}_")
        if c2.button("🗑️ Elimina", key=f"del_{sid}"):
            _delete_snapshot(sid)
            st.rerun()
