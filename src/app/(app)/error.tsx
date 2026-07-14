"use client";

import { useEffect } from "react";

export default function AppError({
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
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-lg font-bold mb-2">Si è verificato un errore</h1>
        <p className="text-sm text-ink-muted mb-6">
          Qualcosa non ha funzionato durante il caricamento di questa pagina. Riprova — se il
          problema persiste, contatta l&apos;amministratore segnalando cosa stavi facendo.
        </p>
        {error.digest && (
          <p className="text-xs text-ink-muted mb-6 font-mono">Codice errore: {error.digest}</p>
        )}
        <div className="flex justify-center gap-3">
          <button type="button" className="btn-secondary" onClick={() => (window.location.href = "/")}>
            Torna alla dashboard
          </button>
          <button type="button" className="btn-primary" onClick={() => reset()}>
            Riprova
          </button>
        </div>
      </div>
    </div>
  );
}
