"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          {/* logo generato dal Brand Kit Canva (design DAHOu9CU_-c) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="FleetDSP" className="mx-auto h-32 w-32 object-contain -my-4" />
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
