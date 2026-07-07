"use client";

import { useRef, useState, useTransition } from "react";
import { previewImportAction, commitImportAction, type PreviewResult, type CommitResult } from "./actions";

type SpecField = { key: string; label: string; required: boolean };
type SpecInfo = { entity: string; label: string; description: string; fields: SpecField[] };

export function ImportWizard({ specs }: { specs: SpecInfo[] }) {
  const [entity, setEntity] = useState<string>(specs[0].entity);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [mode, setMode] = useState<"partial" | "strict">("partial");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const spec = specs.find((s) => s.entity === entity)!;

  function buildFormData(withMapping: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file) return null;
    const fd = new FormData();
    fd.set("entity", entity);
    fd.set("file", file);
    if (withMapping) fd.set("mapping", JSON.stringify(mapping));
    fd.set("mode", mode);
    return fd;
  }

  function analyze(useCurrentMapping = false) {
    const fd = buildFormData(useCurrentMapping);
    if (!fd) return;
    setResult(null);
    startTransition(async () => {
      const p = await previewImportAction(fd);
      setPreview(p);
      setMapping(p.mapping);
    });
  }

  function commit() {
    const fd = buildFormData(true);
    if (!fd) return;
    startTransition(async () => {
      const r = await commitImportAction(fd);
      setResult(r);
      if (r.ok) setPreview(null);
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. scelta entità e template */}
      <section className="card p-5">
        <h2 className="font-semibold mb-3">1 · Scegli cosa importare</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {specs.map((s) => (
            <button
              key={s.entity}
              onClick={() => { setEntity(s.entity); setPreview(null); setResult(null); }}
              className={`text-left rounded-control border px-3 py-2.5 text-sm transition-colors ${
                s.entity === entity ? "border-brand bg-brand-light font-semibold" : "border-line hover:bg-surface-sunken"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-muted mt-3">{spec.description}</p>
        <div className="mt-3 flex gap-3 text-sm">
          <a className="underline text-brand" href={`/api/import/template/${entity}`}>Scarica template .xlsx</a>
          <a className="underline text-brand" href={`/api/import/template/${entity}?format=csv`}>Scarica template .csv</a>
        </div>
      </section>

      {/* 2. upload e anteprima */}
      <section className="card p-5">
        <h2 className="font-semibold mb-3">2 · Carica il file e verifica l&apos;anteprima</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="text-sm"
            onChange={() => { setPreview(null); setResult(null); }}
          />
          <button className="btn-primary" onClick={() => analyze(false)} disabled={pending}>
            {pending ? "Analisi…" : "Analizza file"}
          </button>
        </div>

        {preview?.error && (
          <p className="mt-4 text-sm text-danger bg-danger-soft rounded-control px-3 py-2">{preview.error}</p>
        )}

        {preview && !preview.error && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-control bg-ok-soft py-3">
                <div className="text-2xl font-bold text-ok">{preview.validCount}</div>
                <div className="text-xs text-ink-muted">righe valide</div>
              </div>
              <div className="rounded-control bg-warn-soft py-3">
                <div className="text-2xl font-bold text-warn">{preview.duplicateCount}</div>
                <div className="text-xs text-ink-muted">duplicati</div>
              </div>
              <div className="rounded-control bg-danger-soft py-3">
                <div className="text-2xl font-bold text-danger">{preview.errorCount}</div>
                <div className="text-xs text-ink-muted">righe con errori</div>
              </div>
            </div>

            {/* mapping colonne flessibile */}
            <details className="rounded-control border border-line p-3" open={Object.values(mapping).some((v) => v === null)}>
              <summary className="text-sm font-semibold cursor-pointer">
                Mapping colonne {Object.values(mapping).some((v) => v === null) && (
                  <span className="text-warn">— alcune colonne non riconosciute, rimappale qui</span>
                )}
              </summary>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {spec.fields.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-sm">
                    <span className="w-44 shrink-0 truncate">
                      {f.label}{f.required && <span className="text-danger">*</span>}
                    </span>
                    <select
                      className="input py-1"
                      value={mapping[f.key] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))
                      }
                    >
                      <option value="">— non presente —</option>
                      {preview.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `colonna ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button className="btn-secondary mt-3" onClick={() => analyze(true)} disabled={pending}>
                Rianalizza con questo mapping
              </button>
            </details>

            {preview.issues.length > 0 && (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr><th>Riga</th><th>Tipo</th><th>Motivo</th></tr>
                  </thead>
                  <tbody>
                    {preview.issues.map((iss, i) => (
                      <tr key={i}>
                        <td className="font-mono">{iss.rowIndex}</td>
                        <td>
                          <span className={iss.status === "duplicate" ? "badge-warn" : "badge-danger"}>
                            {iss.status === "duplicate" ? "duplicato" : "errore"}
                          </span>
                        </td>
                        <td>{iss.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. conferma */}
            <div className="rounded-control border border-line p-4 space-y-3">
              <h3 className="text-sm font-semibold">3 · Conferma import</h3>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="mode" checked={mode === "partial"} onChange={() => setMode("partial")} className="mt-0.5" />
                <span>Importa solo le righe valide ({preview.validCount}) e scarta le altre</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="mode" checked={mode === "strict"} onChange={() => setMode("strict")} className="mt-0.5" />
                <span>Blocco totale: non importare nulla se ci sono errori o duplicati</span>
              </label>
              <button className="btn-primary" onClick={commit} disabled={pending || preview.validCount === 0}>
                {pending ? "Import in corso…" : `Importa`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className={`mt-4 rounded-control px-4 py-3 text-sm ${result.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
            <p className="font-semibold">{result.message}</p>
            {result.notes.length > 0 && (
              <div className="mt-2 text-ink">
                <p className="font-semibold text-xs uppercase">Note operative (conservare):</p>
                <ul className="list-disc ml-5 mt-1 font-mono text-xs">
                  {result.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
