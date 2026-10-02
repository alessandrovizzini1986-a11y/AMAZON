"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge, EmptyState, SourceNote } from "@/components/ui";
import { fmtEur } from "@/lib/format";

export type VehicleRow = {
  id: string;
  targa: string;
  modello: string;
  allestimento: string | null;
  alimentazioneLabel: string;
  hvoNote: boolean;
  stationCode: string;
  stationName: string;
  stato: string;
  kmAttuali: number;
  canoneMese: number | null;
  leasingCompany: string | null;
};

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral" | "info"> = {
  ATTIVO: "ok",
  IN_OFFICINA: "warn",
  SOSTITUTIVO: "warn",
  UFFICIO: "info",
  DISMESSO: "neutral",
};

type SortKey = "targa" | "stationCode" | "modello" | "stato" | "leasingCompany" | "canoneMese";
type SortDir = "asc" | "desc";

// su mobile restano solo targa, stazione, stato e canone: si leggono al volo
const COLUMNS: { key: SortKey; label: string; right?: boolean; adminOnly?: boolean; desktopOnly?: boolean }[] = [
  { key: "targa", label: "Targa" },
  { key: "stationCode", label: "Stazione" },
  { key: "modello", label: "Modello", desktopOnly: true },
  { key: "stato", label: "Stato" },
  { key: "leasingCompany", label: "Noleggio", desktopOnly: true },
  { key: "canoneMese", label: "Canone/mese", right: true, adminOnly: true },
];

function distinctSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))].sort((a, b) => a.localeCompare(b));
}

/**
 * Ricerca targa + filtri modello/noleggio + ordinamento su ogni colonna:
 * tutto lato client sulla lista già caricata. I filtri stazione/stato
 * (passati in `filters`) restano link/form GET perché richiedono una nuova
 * query al DB.
 */
export function VehicleTable({
  vehicles,
  statusLabels,
  isAdmin,
  filters,
}: {
  vehicles: VehicleRow[];
  statusLabels: Record<string, string>;
  isAdmin: boolean;
  filters?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [modello, setModello] = useState("");
  const [compagnia, setCompagnia] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("targa");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const columns = COLUMNS.filter((c) => isAdmin || !c.adminOnly);

  const options = useMemo(() => ({
    modello: distinctSorted(vehicles.map((v) => v.modello)),
    compagnia: distinctSorted(vehicles.map((v) => v.leasingCompany)),
  }), [vehicles]);

  const filtered = useMemo(() => {
    const q = query.replace(/\s+/g, "").toUpperCase();
    let rows = vehicles;
    if (q) rows = rows.filter((v) => v.targa.toUpperCase().includes(q));
    if (modello) rows = rows.filter((v) => v.modello === modello);
    if (compagnia) rows = rows.filter((v) => (v.leasingCompany ?? "") === compagnia);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // i valori mancanti vanno sempre in fondo, in entrambe le direzioni
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [vehicles, query, modello, compagnia, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtriAttivi = Boolean(query || modello || compagnia);

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-[2] flex-col gap-1.5 text-[13px] font-semibold text-ink-muted">
            Cerca targa
            <input
              type="search"
              className="input h-12 px-4 font-mono text-[17px] uppercase text-ink placeholder:normal-case"
              placeholder="Es. GS214JN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select className="input h-12 min-w-[140px] flex-1" value={modello} onChange={(e) => setModello(e.target.value)} aria-label="Filtra per modello">
            <option value="">Tutti i modelli</option>
            {options.modello.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="input h-12 min-w-[140px] flex-1" value={compagnia} onChange={(e) => setCompagnia(e.target.value)} aria-label="Filtra per noleggio">
            <option value="">Tutti i noleggi</option>
            {options.compagnia.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {filtriAttivi && (
            <button
              type="button"
              className="btn-secondary h-12"
              onClick={() => { setQuery(""); setModello(""); setCompagnia(""); }}
            >
              Azzera
            </button>
          )}
        </div>
        {filters}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={
            filtriAttivi
              ? "Nessuna targa corrisponde alla ricerca."
              : "Nessun veicolo trovato con questi filtri. Usa Import per il caricamento iniziale."
          }
        />
      ) : (
        <div>
          <div className="card overflow-x-auto">
            <table className="table-base text-[15px]">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={`${c.right ? "text-right" : ""} ${c.desktopOnly ? "hidden md:table-cell" : ""}`}>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 font-semibold uppercase hover:text-brand ${c.right ? "justify-end" : ""}`}
                        onClick={() => toggleSort(c.key)}
                      >
                        {c.label}
                        {sortKey === c.key && <span aria-hidden>{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/vehicles/${v.id}`} className="font-mono text-base font-semibold tracking-[0.02em] text-brand hover:underline">
                        {v.targa}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="font-mono font-semibold">{v.stationCode}</span>{" "}
                      <span className="hidden text-ink-muted sm:inline">{v.stationName}</span>
                    </td>
                    <td className="hidden md:table-cell">{v.modello}{v.allestimento ? <span className="text-ink-muted"> · {v.allestimento}</span> : null}</td>
                    <td><StatusBadge tone={STATUS_TONE[v.stato]}>{statusLabels[v.stato]}</StatusBadge></td>
                    <td className="hidden text-[#3c4a5c] md:table-cell">{v.leasingCompany ?? "—"}</td>
                    {isAdmin && (
                      <td className="whitespace-nowrap text-right font-semibold">{v.canoneMese ? fmtEur(v.canoneMese) : "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourceNote>
            tabella Vehicle — {filtered.length} di {vehicles.length} veicoli al {new Date().toLocaleDateString("it-IT")}
            {filtriAttivi ? " · ricerca/filtri attivi" : ""} · clic sulla targa per scheda e storico stazioni
          </SourceNote>
        </div>
      )}
    </div>
  );
}
