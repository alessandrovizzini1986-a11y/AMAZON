"""Login a password semplice per l'accesso online.

La password si imposta via st.secrets["app_password"] (file .streamlit/secrets.toml)
oppure via variabile d'ambiente APP_PASSWORD. Se non configurata, l'app resta
aperta e mostra un avviso: va impostata PRIMA di pubblicarla online.
"""
import os

import streamlit as st


def _configured_password():
    try:
        if "app_password" in st.secrets:
            return st.secrets["app_password"]
    except Exception:
        pass
    return os.environ.get("APP_PASSWORD")


def require_auth() -> bool:
    pwd = _configured_password()

    if not pwd:
        st.warning(
            "⚠️ Nessuna password configurata: l'app è APERTA. "
            "Imposta `APP_PASSWORD` (o `.streamlit/secrets.toml`) prima di pubblicarla online."
        )
        return True

    if st.session_state.get("authed"):
        return True

    with st.form("login"):
        entered = st.text_input("Password", type="password")
        ok = st.form_submit_button("Entra")
    if ok:
        if entered == pwd:
            st.session_state["authed"] = True
            st.rerun()
        else:
            st.error("Password errata.")
    return False
