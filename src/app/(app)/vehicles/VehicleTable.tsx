"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge, EmptyState, SourceNote } from "@/components/ui";
import { fmtEur, fmtKm } from "@/lib/format";

export type VehicleRow = {
  id: string;
  targa: string;
  modello: string;
  allestimento: string | null;
  alimentazioneLabel: string;
  hvoNote: boolean;
  stationCode: string;
  stato: string;
  kmAttuali: number;
  canoneMese: number | null;
  leasingCompany: string | null;
};

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral" | "info"> = {
  ATTIVO: "ok",
  IN_OFFICINA: "warn",
  SOSTITUTIVO: "info",
  UFFICIO: "neutral",
  DISMESSO: "neutral",
};

/**
 * Ricerca targa lato client: filtra la lista già caricata mentre si digita,
 * senza round-trip al server — a differenza dei filtri stazione/stato che
 * restano un form GET (richiedono comunque una nuova query al DB).
 */
export function VehicleTable({
  vehicles,
  statusLabels,
  isAdmin,
}: {
  vehicles: VehicleRow[];
  statusLabels: Record<string, string>;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => v.targa.toUpperCase().includes(q));
  }, [vehicles, query]);

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          className="input max-w-56"
          placeholder="Cerca targa…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cerca per targa"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={
            query
              ? `Nessuna targa corrisponde a "${query}".`
              : "Nessun veicolo trovato con questi filtri. Usa Import dati per il caricamento iniziale."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Targa</th><th>Modello</th><th>Alimentazione</th><th>Stazione</th>
                <th>Stato</th><th>Km</th><th>Canone/mese</th><th>Leasing</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/vehicles/${v.id}`} className="font-mono font-semibold text-brand hover:underline">
                      {v.targa}
                    </Link>
                  </td>
                  <td>{v.modello}{v.allestimento ? ` · ${v.allestimento}` : ""}</td>
                  <td>{v.alimentazioneLabel}{v.hvoNote ? " (HVO ok)" : ""}</td>
                  <td>{v.stationCode}</td>
                  <td><StatusBadge tone={STATUS_TONE[v.stato]}>{statusLabels[v.stato]}</StatusBadge></td>
                  <td className="whitespace-nowrap">{fmtKm(v.kmAttuali)}</td>
                  <td className="whitespace-nowrap">{isAdmin && v.canoneMese ? fmtEur(v.canoneMese) : "—"}</td>
                  <td>{v.leasingCompany ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 pb-3">
            <SourceNote>
              tabella Vehicle — {filtered.length} di {vehicles.length} veicoli al {new Date().toLocaleDateString("it-IT")}
              {query ? ` · filtro ricerca targa "${query}"` : ""}
            </SourceNote>
          </div>
        </div>
      )}
    </div>
  );
}
