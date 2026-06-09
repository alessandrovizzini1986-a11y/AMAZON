"""Gestionale AMAZON — entry point Streamlit."""
import streamlit as st

from core.auth import require_auth
from core.db import current_backend, init_db
from modules import forecast

st.set_page_config(page_title="Gestionale AMAZON", page_icon="📊", layout="wide")

init_db()
if not require_auth():
    st.stop()

st.sidebar.title("📊 Gestionale")
if current_backend() == "postgres":
    st.sidebar.caption("🟢 Database: Postgres (Neon) — dati persistenti")
else:
    st.sidebar.caption("🟡 Database: SQLite locale — i dati NON restano dopo un riavvio online")
page = st.sidebar.radio(
    "Sezione",
    ["Forecast", "Fatture (in arrivo)", "Buste paga (in arrivo)"],
)

if page == "Forecast":
    forecast.render()
else:
    st.header(page)
    st.info("Modulo non ancora implementato — stiamo partendo dal Forecast.")
