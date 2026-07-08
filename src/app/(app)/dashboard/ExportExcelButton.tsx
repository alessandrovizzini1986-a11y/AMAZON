"use client";

import { useState } from "react";

/**
 * L'export genera un Excel multi-foglio lato server (può richiedere qualche
 * secondo su cluster grandi): usiamo fetch+blob invece di un semplice <a href>
 * così il bottone riflette il tempo reale di generazione, non solo il click.
 */
export function ExportExcelButton({ stationId }: { stationId: string | null }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const url = `/api/export/monthly${stationId ? `?station=${stationId}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Export fallito (${res.status})`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "fleetdsp_report.xlsx";

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("Impossibile generare l'export. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="btn-secondary whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
          Generazione…
        </span>
      ) : (
        "⬇ Export Excel"
      )}
    </button>
  );
}
