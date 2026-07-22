"use client";

import { useActionState, useState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card w-full p-8 shadow-lift">
          <div className="mb-8 text-center">
            {/* logo generato dal Brand Kit Canva (design DAHOu9CU_-c) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="FleetDSP" className="mx-auto -my-4 h-32 w-32 object-contain" />
            <p className="mt-1 text-sm text-ink-muted">Gestionale flotta veicoli commerciali</p>
          </div>
          <form action={formAction} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  className="input pr-12"
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-sm text-ink-muted hover:text-ink"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                  tabIndex={-1}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            {state?.error && (
              <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
            )}
            <button className="btn-primary w-full" disabled={pending}>
              {pending ? "Accesso in corso…" : "Accedi"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          FleetDSP · 8 stazioni, una sola fonte di verità
        </p>
      </div>
    </main>
  );
}
