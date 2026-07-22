"use client";

import { useActionState, useState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

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
