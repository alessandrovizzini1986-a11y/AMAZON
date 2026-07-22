"use client";

import { useActionState, useState } from "react";
import { changeMyPasswordAction } from "./actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changeMyPasswordAction, undefined);
  const [show, setShow] = useState(false);
  const type = show ? "text" : "password";

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="currentPassword">Password attuale</label>
        <input className="input" id="currentPassword" name="currentPassword" type={type} autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="newPassword">Nuova password</label>
        <input className="input" id="newPassword" name="newPassword" type={type} autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="confirmPassword">Conferma nuova password</label>
        <input className="input" id="confirmPassword" name="confirmPassword" type={type} autoComplete="new-password" minLength={8} required />
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Mostra le password
      </label>
      {state?.error && <p className="text-sm text-danger bg-danger-soft rounded-control px-3 py-2">{state.error}</p>}
      {state?.success && <p className="text-sm text-ok bg-ok-soft rounded-control px-3 py-2">{state.success}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Aggiornamento…" : "Aggiorna password"}</button>
    </form>
  );
}
