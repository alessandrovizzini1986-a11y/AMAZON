"""Modulo Forecast: carica file CSV/XLS/XLSX, salva snapshot e confronta
due periodi calcolando lo scostamento in valore assoluto e percentuale.
"""
from datetime import datetime

import pandas as pd
import streamlit as st

from core import db


# --------------------------- Lettura file ---------------------------
def _excel_sheets(uploaded) -> list:
    uploaded.seek(0)
    return pd.ExcelFile(uploaded).sheet_names


def _read_file(uploaded, sheet_name=None) -> pd.DataFrame:
    name = uploaded.name.lower()
    if name.endswith(".csv"):
        uploaded.seek(0)
        return pd.read_csv(uploaded)
    if name.endswith((".xls", ".xlsx")):
        uploaded.seek(0)
        return pd.read_excel(uploaded, sheet_name=0 if sheet_name is None else sheet_name)
    raise ValueError("Formato non supportato. Usa CSV, XLS o XLSX.")


# --------------------------- Accesso dati ---------------------------
def _load_rows(sid: int) -> pd.DataFrame:
    return pd.DataFrame(db.load_rows(sid), columns=["chiave", "valore"])


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

    sheet = None
    if not f.name.lower().endswith(".csv"):
        try:
            sheets = _excel_sheets(f)
        except Exception as e:
            st.error(str(e))
            return
        sheet = st.selectbox("Foglio del file", sheets) if len(sheets) > 1 else sheets[0]

    try:
        df = _read_file(f, sheet)
    except Exception as e:  # formato/parse error -> messaggio leggibile
        st.error(str(e))
        return

    st.caption("Anteprima (prime 20 righe):")
    st.dataframe(df.head(20), use_container_width=True)

    cols = list(df.columns)
    key_cols = st.multiselect(
        "Colonne chiave — identificano la voce da confrontare (es. Voce, Station)", cols
    )
    num_cols = [
        c for c in cols
        if c not in key_cols and pd.api.types.is_numeric_dtype(df[c])
    ]
    if not num_cols:
        st.warning("Nessuna colonna numerica disponibile per il valore (escluse le colonne chiave).")
        return
    value_col = st.selectbox("Colonna valore (numerica)", num_cols)

    default_name = f"{f.name} — {datetime.now():%Y-%m-%d}"
    name = st.text_input("Nome snapshot", value=default_name)

    can_save = bool(key_cols and value_col and name)
    if st.button("💾 Salva snapshot", disabled=not can_save):
        work = df[key_cols + [value_col]].copy()
        work["__key__"] = work[key_cols].astype(str).agg(" | ".join, axis=1)
        grouped = work.groupby("__key__")[value_col].sum()
        sid = db.save_snapshot(name, f.name, list(grouped.items()))
        st.success(f"Snapshot salvato (id {sid}) — {len(grouped)} voci aggregate.")


def _render_compare():
    snaps = db.list_snapshots()
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
    snaps = db.list_snapshots()
    if not snaps:
        st.info("Nessuno snapshot salvato.")
        return
    for sid, name, filename, uploaded_at in snaps:
        c1, c2 = st.columns([5, 1])
        c1.write(f"**[{sid}] {name}**  \n_{filename or '—'} · {uploaded_at}_")
        if c2.button("🗑️ Elimina", key=f"del_{sid}"):
            db.delete_snapshot(sid)
            st.rerun()
