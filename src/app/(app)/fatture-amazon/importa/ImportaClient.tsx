"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseInvoice, type Fattura } from "@/domain/fatture/parser";
import { deltaDaControllare, riepilogoDescrizioni, statiCaricamento, type EsitoFile, type Lettura } from "@/domain/fatture/importa";
import { daRigaPdf, ordinaRighe, tsv, type RigaFatt } from "@/domain/fatture/righe";
import { espandiFile, pagineDaPdf } from "@/lib/fatture/pdf";
import { excelImport, nomeFileImport } from "@/lib/fatture/excelImport";
import { scarica } from "@/lib/presenze/excelUtil";
import { Dropzone } from "@/components/Dropzone";
import { registraEsportazione, verificaNumeri, type FatturaDaRegistrare } from "./actions";
import { Aiuto } from "@/components/Aiuto";

const eur = (x: number | null) => (x === null ? "—" : x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const isoD = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const ggmm = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "UTC" }) : "—");

const BADGE: Record<EsitoFile["stato"], string> = {
  nuova: "badge-ok",
  "già presente": "badge-neutral",
  "doppione nel caricamento": "badge-warn",
  errore: "badge-danger",
};

export function ImportaClient({ ultimo, prossimo, note, macro }: {
  ultimo: string | null; prossimo: number | null; note: string[]; macro: Record<string, { macroarea: string; microarea: string }>;
}) {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [stato, setStato] = useState("");
  const [esiti, setEsiti] = useState<EsitoFile[]>([]);
  const [registrato, setRegistrato] = useState(false);
  const [precompila, setPrecompila] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async (files: File[]) => {
    if (!files.length) return;
    setLavoro(true); setEsiti([]); setRegistrato(false); setMsg(null); setErrore(null);
    try {
      setStato("Apertura dei file…");
      const lista = await espandiFile(files);
      const letture: Lettura[] = [];
      for (const [i, f] of lista.entries()) {
        setStato(`Lettura PDF ${i + 1}/${lista.length}: ${f.nome}`);
        if (f.errore) { letture.push({ file: f.nome, sha256: f.sha256, errore: f.errore }); continue; }
        try {
          letture.push({ file: f.nome, sha256: f.sha256, fattura: parseInvoice(await pagineDaPdf(f.data), f.nome) });
        } catch {
          letture.push({ file: f.nome, sha256: f.sha256, errore: "PDF illeggibile" });
        }
      }
      setStato("Controllo nel registro…");
      const numeri = [...new Set(letture.map((l) => l.fattura?.numero).filter((n): n is string => !!n).map((n) => n.trim().toUpperCase().replace(/^N?V-/, "INV-")))];
      const reg = numeri.length ? await verificaNumeri(numeri) : {};
      setEsiti(statiCaricamento(letture, reg));
      setStato("");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
      setStato("");
    } finally {
      setLavoro(false);
    }
  };

  const nuove = esiti.filter((e) => e.stato === "nuova" && e.fattura) as (EsitoFile & { fattura: Fattura; numero: string })[];
  const righe: RigaFatt[] = useMemo(() => {
    const r = ordinaRighe(nuove.flatMap((e) => e.fattura.righe.map((x) => daRigaPdf(x, e.numero, e.fattura.ds!))));
    return precompila ? r.map((x) => ({ ...x, microarea: macro[x.descrizione]?.microarea ?? null, macroarea: macro[x.descrizione]?.macroarea ?? null })) : r;
  }, [nuove, precompila, macro]);
  const nonMappate = precompila ? [...new Set(righe.filter((r) => !r.macroarea).map((r) => r.descrizione))] : [];
  const descrizioni = useMemo(() => riepilogoDescrizioni(nuove.map((e) => e.fattura), new Set(note)), [nuove, note]);
  const conteggi = (["nuova", "già presente", "doppione nel caricamento", "errore"] as const).map((s) => [s, esiti.filter((e) => e.stato === s).length] as const);

  /** Al primo Scarica / Copia: salva fatture e righe nel registro, a lotti di massimo 500 righe. */
  const registra = async () => {
    if (registrato || !nuove.length) return;
    const daInviare: FatturaDaRegistrare[] = nuove.map((e) => {
      const f = e.fattura;
      const primo = f.righe[0].Data;
      return {
        numero: e.numero, ds: f.ds!, tipo: f.tipoDoc, dataFattura: isoD(f.dataFattura) ?? isoD(f.periodoA) ?? isoD(primo)!, periodoDa: isoD(f.periodoDa) ?? isoD(primo)!,
        periodoA: isoD(f.periodoA) ?? isoD(f.righe[f.righe.length - 1].Data)!, importoDovuto: f.importoDovuto ?? f.sommaTotale, sommaTotale: f.sommaTotale, sommaAvere: f.sommaAvere,
        rifNotaCredito: f.rifNotaCredito, pdfNome: e.file, pdfSha256: e.sha256, righe: righe.filter((r) => r.numero === e.numero),
      };
    });
    const lotti: FatturaDaRegistrare[][] = [];
    let cur: FatturaDaRegistrare[] = [], n = 0;
    for (const f of daInviare) {
      if (n + f.righe.length > 500 && cur.length) { lotti.push(cur); cur = []; n = 0; }
      cur.push(f); n += f.righe.length;
    }
    if (cur.length) lotti.push(cur);
    let reg = 0;
    for (const [i, l] of lotti.entries()) {
      setStato(`Registrazione ${i + 1}/${lotti.length}…`);
      reg += (await registraEsportazione({ fatture: l })).registrate;
    }
    setStato("");
    setRegistrato(true);
    setMsg(`${reg} fatture registrate come esportate (${righe.length} righe).`);
    router.refresh();
  };

  const excel = async () => {
    setLavoro(true);
    try {
      await registra();
      const fatture = esiti.filter((e) => e.fattura).map((e) => ({
        numero: e.numero ?? "", ds: e.fattura!.ds ?? "", tipo: e.fattura!.tipoDoc, dataFattura: isoD(e.fattura!.dataFattura), periodoDa: isoD(e.fattura!.periodoDa), periodoA: isoD(e.fattura!.periodoA),
        importoDovuto: e.fattura!.importoDovuto, sommaTotale: e.fattura!.sommaTotale, sommaAvere: e.fattura!.sommaAvere, delta: e.fattura!.delta, nRighe: e.fattura!.righe.length,
        stato: e.motivo ? `${e.stato} (${e.motivo})` : e.stato, file: e.file,
      }));
      const scartate = esiti.filter((e) => e.stato !== "nuova").map((e) => ({ file: e.file, stato: e.stato, motivo: e.motivo }));
      await scarica(excelImport(righe, fatture, scartate, descrizioni), nomeFileImport());
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setLavoro(false);
    }
  };

  const copia = async () => {
    setLavoro(true);
    try {
      await registra();
      const testo = tsv(righe);
      try {
        await navigator.clipboard.writeText(testo);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = testo;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setMsg(`${righe.length} righe copiate: incollale in fondo a fatt_2026 (prima colonna DS).`);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setLavoro(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-control border border-line bg-surface-raised px-4 py-3 text-sm">
        Ultima fattura registrata: <b className="font-mono">{ultimo ?? "nessuna"}</b>{prossimo !== null && <> · prossimo numero da scaricare: <b className="font-mono">{prossimo}</b></>}
      </p>
      <Dropzone titolo="Trascina qui i PDF delle fatture" aiuto="fatture.importa" accept=".pdf,.zip" multiple lavoro={lavoro} onFiles={carica}
        testo={<>Anche 80 insieme, oppure lo zip prodotto dal preferito del browser (<code>DS-INV-IT3JDBF-XXXXXXX.pdf</code>). I PDF si leggono qui nel browser: al sito arrivano solo le righe.</>} />
      {stato && <p className="text-sm text-ink-muted">{stato}</p>}
      {errore && <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}

      {esiti.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {conteggi.map(([s, n]) => <div key={s} className="card p-4"><div className="text-xs font-medium text-ink-muted">{s}</div><div className="text-2xl font-bold">{n}</div></div>)}
            <div className="card p-4"><div className="text-xs font-medium text-ink-muted">Righe nuove</div><div className="text-2xl font-bold">{righe.length}</div></div>
          </section>

          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-[19px] font-semibold">File caricati ({esiti.length})</h2>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={precompila} onChange={(e) => setPrecompila(e.target.checked)} /> MICRO/MACROAREA precompilate</label>
              <button type="button" className="btn-primary h-10" disabled={lavoro || !righe.length} onClick={excel}>Scarica Excel</button> <Aiuto k="fatture.excel" />
              <button type="button" className="btn-secondary h-10" disabled={lavoro || !righe.length} onClick={copia}>Copia righe</button> <Aiuto k="fatture.copia" />
            </div>
            {msg && <p className="mb-3 rounded-control bg-ok-soft px-3 py-2 text-sm text-ok">{msg}</p>}
            {nonMappate.length > 0 && <p className="mb-3 rounded-control bg-warn-soft px-3 py-2 text-sm text-warn">{nonMappate.length} descrizioni senza MICRO/MACROAREA nel mapping: restano vuote ({nonMappate.slice(0, 5).join("; ")}{nonMappate.length > 5 ? "…" : ""}).</p>}
            <div className="overflow-x-auto">
              <table className="table-base text-sm">
                <thead><tr><th>File</th><th>Numero</th><th>DS</th><th>Tipo</th><th>Data fattura</th><th>Periodo</th><th className="text-right">Importo PDF</th><th className="text-right">Somma righe</th><th className="text-right">Delta</th><th>N righe</th><th>Stato</th></tr></thead>
                <tbody>
                  {esiti.map((e, i) => {
                    const f = e.fattura;
                    return (
                      <tr key={i}>
                        <td className="text-xs">{e.file}</td><td className="font-mono text-xs">{e.numero ?? "—"}</td><td className="font-mono">{f?.ds ?? ""}</td><td>{f?.tipoDoc ?? ""}</td>
                        <td>{f ? ggmm(f.dataFattura) : ""}</td><td className="whitespace-nowrap">{f ? `${ggmm(f.periodoDa)} – ${ggmm(f.periodoA)}` : ""}</td>
                        <td className="text-right font-mono">{f ? eur(f.importoDovuto) : ""}</td><td className="text-right font-mono">{f ? eur(f.sommaTotale) : ""}</td>
                        <td className="text-right font-mono">{f ? <>{eur(f.delta)}{deltaDaControllare(f.delta) && <span className="ml-1 badge-warn">controllare</span>}</> : ""}</td>
                        <td>{f?.righe.length ?? ""}</td>
                        <td><span className={BADGE[e.stato]}>{e.stato}</span>{e.motivo && <div className="text-xs text-ink-muted">{e.motivo}</div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-faint">Delta = importo dovuto del PDF − somma delle righe: tra −3 e +3 € è normale (IVA arrotondata da Amazon sul riepilogo).</p>
          </section>

          {descrizioni.length > 0 && (
            <section className="card overflow-x-auto p-4 md:p-5">
              <h2 className="mb-3 text-[19px] font-semibold">Descrizioni delle fatture nuove ({descrizioni.length})</h2>
              <table className="table-base text-sm">
                <thead><tr><th>Descrizione</th><th>Classe</th><th>N righe</th><th className="text-right">Somma AVERE</th><th></th></tr></thead>
                <tbody>{descrizioni.map((d) => <tr key={d.descrizione}><td>{d.descrizione}</td><td className="font-mono text-xs">{d.classe}</td><td>{d.nRighe}</td><td className="text-right font-mono">{eur(d.avere)}</td><td>{d.nuova && <span className="badge-warn">nuova</span>}</td></tr>)}</tbody>
              </table>
              {note.length === 0 && <p className="mt-2 text-xs text-ink-faint">Lo storico non è ancora caricato: le descrizioni &quot;nuove&quot; si vedono dopo il carica storico.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
