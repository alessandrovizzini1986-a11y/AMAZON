"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          {/* logo: DA SOSTITUIRE CON ASSET CANVA (design/brand/logo.svg) */}
          <div className="mx-auto mb-3 h-12 w-12 rounded-card bg-brand text-ink-inverse flex items-center justify-center text-xl font-bold">
            F
          </div>
          <h1 className="text-2xl font-bold">FleetDSP</h1>
          <p className="text-sm text-ink-muted mt-1">Gestionale flotta veicoli commerciali</p>
        </div>
        <form action={formAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error && (
            <p className="text-sm text-danger bg-danger-soft rounded-control px-3 py-2">{state.error}</p>
          )}
          <button className="btn-primary w-full" disabled={pending}>
            {pending ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
      </div>
    </main>
  );
}
