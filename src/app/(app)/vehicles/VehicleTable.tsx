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

type SortKey = "targa" | "modello" | "alimentazioneLabel" | "stationCode" | "stato" | "kmAttuali" | "canoneMese" | "leasingCompany";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "targa", label: "Targa" },
  { key: "modello", label: "Modello" },
  { key: "alimentazioneLabel", label: "Alimentazione" },
  { key: "stationCode", label: "Stazione" },
  { key: "stato", label: "Stato" },
  { key: "kmAttuali", label: "Km" },
  { key: "canoneMese", label: "Canone/mese" },
  { key: "leasingCompany", label: "Compagnia" },
];

function distinctSorted<T>(values: (T | null)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== null))].sort((a, b) => (a! > b! ? 1 : a! < b! ? -1 : 0));
}

/**
 * Ricerca targa + filtri modello/alimentazione/canone/compagnia + ordinamento
 * su ogni colonna: tutto lato client sulla lista già caricata, senza
 * round-trip al server — a differenza dei filtri stazione/stato che restano
 * un form GET (richiedono comunque una nuova query al DB).
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
  const [modello, setModello] = useState("");
  const [alimentazione, setAlimentazione] = useState("");
  const [canone, setCanone] = useState("");
  const [compagnia, setCompagnia] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("targa");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const options = useMemo(() => ({
    modello: distinctSorted(vehicles.map((v) => v.modello)),
    alimentazione: distinctSorted(vehicles.map((v) => v.alimentazioneLabel)),
    canone: distinctSorted(vehicles.map((v) => v.canoneMese)),
    compagnia: distinctSorted(vehicles.map((v) => v.leasingCompany)),
  }), [vehicles]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let rows = vehicles;
    if (q) rows = rows.filter((v) => v.targa.toUpperCase().includes(q));
    if (modello) rows = rows.filter((v) => v.modello === modello);
    if (alimentazione) rows = rows.filter((v) => v.alimentazioneLabel === alimentazione);
    if (canone) rows = rows.filter((v) => String(v.canoneMese ?? "") === canone);
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
  }, [vehicles, query, modello, alimentazione, canone, compagnia, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtriAttivi = Boolean(query || modello || alimentazione || canone || compagnia);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          className="input max-w-56"
          placeholder="Cerca targa…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cerca per targa"
        />
        <select className="input max-w-56" value={modello} onChange={(e) => setModello(e.target.value)} aria-label="Filtra per modello">
          <option value="">Tutti i modelli</option>
          {options.modello.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="input max-w-48" value={alimentazione} onChange={(e) => setAlimentazione(e.target.value)} aria-label="Filtra per alimentazione">
          <option value="">Tutte le alimentazioni</option>
          {options.alimentazione.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input max-w-40" value={canone} onChange={(e) => setCanone(e.target.value)} aria-label="Filtra per canone">
          <option value="">Tutti i canoni</option>
          {options.canone.map((c) => <option key={c} value={c}>{fmtEur(c)}</option>)}
        </select>
        <select className="input max-w-48" value={compagnia} onChange={(e) => setCompagnia(e.target.value)} aria-label="Filtra per compagnia">
          <option value="">Tutte le compagnie</option>
          {options.compagnia.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {filtriAttivi && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setQuery(""); setModello(""); setAlimentazione(""); setCanone(""); setCompagnia(""); }}
          >
            Rimuovi filtri
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={
            filtriAttivi
              ? "Nessun veicolo corrisponde ai filtri selezionati."
              : "Nessun veicolo trovato con questi filtri. Usa Import dati per il caricamento iniziale."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key}>
                    <button
                      type="button"
                      className="flex items-center gap-1 font-semibold hover:text-brand"
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
              {filtriAttivi ? " · filtri attivi" : ""}
            </SourceNote>
          </div>
        </div>
      )}
    </div>
  );
}
