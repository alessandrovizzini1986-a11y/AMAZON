"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <h1 className="text-lg font-bold mb-2">Si è verificato un errore</h1>
        <p className="text-sm text-ink-muted mb-6">
          Qualcosa non ha funzionato. Riprova — se il problema persiste, contatta l&apos;amministratore.
        </p>
        {error.digest && (
          <p className="text-xs text-ink-muted mb-6 font-mono">Codice errore: {error.digest}</p>
        )}
        <button type="button" className="btn-primary" onClick={() => reset()}>
          Riprova
        </button>
      </div>
    </main>
  );
}
