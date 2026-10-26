"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  applyFiltri,
  countCentri,
  DEFAULT_FILTRI,
  facetOptions,
  filtriFromParams,
  filtriToParams,
  LABELS,
  pruneFiltri,
  STATION_PROVINCE,
  toggleValue,
  type Centro,
  type Filtri,
  type FlagField,
  type MultiField,
} from "@/domain/officine";
import { MultiSelect } from "./MultiSelect";

const PAGE = 200;

type SortKey = keyof Centro;
const COLUMNS: { key: SortKey; flag?: boolean }[] = [
  { key: "ragioneSociale" },
  { key: "regione" },
  { key: "localita" },
  { key: "provincia" },
  { key: "indirizzo" },
  { key: "officina", flag: true },
  { key: "carrozzeria", flag: true },
  { key: "rete" },
  { key: "tuttiBrand", flag: true },
  { key: "transit", flag: true },
];

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-line bg-surface-raised px-3 py-2.5 text-sm transition-colors hover:border-brand">
      <span className="font-medium">{label}</span>
      <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-muted">
        Si
        <input type="checkbox" className="h-4 w-4 accent-[#123e73]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </span>
    </label>
  );
}

function SiNo({ v }: { v: boolean }) {
  return v ? <span className="badge-ok">Si</span> : <span className="text-ink-faint">No</span>;
}

function mapsUrl(c: Centro) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.ragioneSociale}, ${c.indirizzo}, ${c.localita} (${c.provincia})`)}`;
}

/**
 * Esploratore dei centri Ayvens: stessi filtri dell'Excel (tendine multi-selezione
 * a cascata, caselle "Si", reset), filtri salvati nell'URL, export della selezione.
 */
export function OfficineExplorer({ centri }: { centri: Centro[] }) {
  const searchParams = useSearchParams();
  const [filtri, setFiltri] = useState<Filtri>(() => pruneFiltri(centri, filtriFromParams(new URLSearchParams(searchParams.toString()))));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // filtri nell'URL (link condivisibili) senza ricaricare la pagina
  const query = filtriToParams(filtri).toString();
  useEffect(() => {
    const url = query ? `/officine?${query}` : "/officine";
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [query]);

  const update = (next: Filtri) => {
    setFiltri(pruneFiltri(centri, next));
    setLimit(PAGE);
  };
  const setMulti = (k: MultiField, values: string[]) => update({ ...filtri, [k]: values });
  const setFlag = (k: FlagField, v: boolean) => update({ ...filtri, [k]: v });

  const options = useMemo(() => facetOptions(centri, filtri), [centri, filtri]);
  const filtered = useMemo(() => {
    const rows = applyFiltri(centri, filtri);
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      const cmp = typeof av === "boolean" ? Number(av) - Number(bv) : collator.compare(String(av), String(bv));
      return cmp * sort.dir;
    });
  }, [centri, filtri, sort]);

  const reset = () => {
    if (!window.confirm("Vuoi davvero resettare tutti i filtri?")) return;
    // come il RESET dell'Excel: tendine vuote e caselle senza spunta
    update({ ...DEFAULT_FILTRI, officina: false });
    setSort(null);
  };

  const attivi =
    (["ragioneSociale", "regione", "localita", "provincia", "rete"] as const).reduce((n, k) => n + filtri[k].length, 0) +
    (["officina", "carrozzeria", "tuttiBrand", "transit"] as const).filter((k) => filtri[k]).length;
  const multi = (k: MultiField) => (
    <MultiSelect
      label={LABELS[k]}
      options={options[k]}
      selected={filtri[k]}
      onToggle={(v) => setMulti(k, toggleValue(filtri[k], v))}
      onClear={() => setMulti(k, [])}
    />
  );
  const exportHref = `/api/officine/export${query ? `?${query}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-6 p-5 md:p-[26px]">
        <div>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Trova centro</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {multi("ragioneSociale")}
            {multi("regione")}
            {multi("localita")}
            {multi("provincia")}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-semibold text-ink-muted">Vicino alle station:</span>
            {STATION_PROVINCE.map((s) => {
              const on = filtri.provincia.length === 1 && filtri.provincia[0] === s.provincia;
              return (
                <button
                  key={s.station}
                  type="button"
                  onClick={() => update({ ...filtri, provincia: on ? [] : [s.provincia], localita: [], regione: [] })}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                    on ? "border-brand bg-brand text-white" : "border-[#d5dbe3] bg-surface-raised text-ink hover:border-brand hover:text-brand"
                  }`}
                  title={`Provincia di ${s.provincia}`}
                >
                  <span className="font-mono">{s.station}</span>
                  <span className={on ? "text-white/80" : "text-ink-muted"}>{s.provincia}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Servizio offerto</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Toggle label="Officina" checked={filtri.officina} onChange={(v) => setFlag("officina", v)} />
              <Toggle label="Carrozzeria" checked={filtri.carrozzeria} onChange={(v) => setFlag("carrozzeria", v)} />
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Rete assistenza per veicoli commerciali</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">{multi("rete")}</div>
              <Toggle label="Assistenza su tutti i brand" checked={filtri.tuttiBrand} onChange={(v) => setFlag("tuttiBrand", v)} />
              <Toggle label="Transit Center (Ford)" checked={filtri.transit} onChange={(v) => setFlag("transit", v)} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <div className="mr-auto">
            <div className="text-[26px] font-bold leading-tight tabular-nums">
              {countCentri(filtered)} <span className="text-base font-semibold text-ink-muted">centri</span>
            </div>
            <div className="text-[13px] text-ink-muted">
              {filtered.length} righe (una per marchio) · {attivi} {attivi === 1 ? "filtro attivo" : "filtri attivi"}
            </div>
          </div>
          <button type="button" onClick={reset} className="btn-secondary h-11">Reset</button>
          <a href={`${exportHref}${query ? "&" : "?"}tutto=1`} className="btn-secondary h-11">Scarica tutto</a>
          <a href={exportHref} className="btn-primary h-11 px-[18px] text-[15px]">Scarica Excel</a>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-muted">Nessun centro con questi filtri.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base text-sm">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={c.flag ? "text-center" : undefined}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-semibold uppercase hover:text-brand"
                      onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                      title="Ordina"
                    >
                      {c.key === "rete" ? "Rete ufficiale" : c.key === "tuttiBrand" ? "Tutti i brand" : c.key === "transit" ? "Transit Center" : LABELS[c.key]}
                      {sort?.key === c.key && <span aria-hidden>{sort.dir === 1 ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((c, i) => (
                <tr key={`${c.ragioneSociale}|${c.indirizzo}|${c.rete}|${i}`}>
                  <td className="min-w-[220px] font-semibold">{c.ragioneSociale}</td>
                  <td className="whitespace-nowrap">{c.regione}</td>
                  <td className="whitespace-nowrap">{c.localita}</td>
                  <td className="whitespace-nowrap">{c.provincia}</td>
                  <td className="min-w-[220px]">
                    <a href={mapsUrl(c)} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline" title="Apri in Google Maps">
                      {c.indirizzo}
                    </a>
                  </td>
                  <td className="text-center"><SiNo v={c.officina} /></td>
                  <td className="text-center"><SiNo v={c.carrozzeria} /></td>
                  <td className="whitespace-nowrap">{c.rete === "Nessuno" ? <span className="text-ink-faint">Nessuno</span> : c.rete}</td>
                  <td className="text-center"><SiNo v={c.tuttiBrand} /></td>
                  <td className="text-center"><SiNo v={c.transit} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > limit && (
            <div className="border-t border-line p-3 text-center">
              <button type="button" className="btn-secondary" onClick={() => setLimit(filtered.length)}>
                Mostra tutte le {filtered.length} righe
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
