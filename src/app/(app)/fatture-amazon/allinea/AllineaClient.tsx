"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/Dropzone";
import { estraiNumeri, numeriDaTesto } from "@/domain/fatture/allinea";
import { normalizzaNumero } from "@/domain/fatture/numero";
import { isoData, righeStorico } from "@/domain/fatture/storico";
import { leggiAggregato } from "@/lib/fatture/leggiAggregato";
import { allineaNumeri, caricaStorico, concludiAllineamento, concludiStorico } from "./actions";
import { Aiuto } from "@/components/Aiuto";

type Report = { titolo: string; righe: [string, string | number][]; elenco?: { titolo: string; voci: string[] } };

export function AllineaClient({ canStorico }: { canStorico: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<"allinea" | "storico">("allinea");
  const [con2025, setCon2025] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [stato, setStato] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [incolla, setIncolla] = useState("");

  const allinea = async (valori: { numero: unknown; ds: unknown; data: unknown }[], file: string, t0: number) => {
    const e = estraiNumeri(valori.map((v) => v.numero));
    const per = new Map<string, { numero: string; ds: string; da: string | null; a: string | null }>();
    for (const v of valori) {
      const raw = v.numero === null || v.numero === undefined ? "" : String(v.numero).trim();
      if (!raw) continue;
      const n = normalizzaNumero(raw);
      const data = isoData(v.data as never);
      const x = per.get(n) ?? { numero: n, ds: String(v.ds ?? "").trim().toUpperCase(), da: data, a: data };
      if (data && (!x.da || data < x.da)) x.da = data;
      if (data && (!x.a || data > x.a)) x.a = data;
      per.set(n, x);
    }
    const lista = [...per.values()];
    let trovati = 0, nuovi = 0;
    for (let i = 0; i < lista.length; i += 2000) {
      setStato(`Allineamento ${Math.min(i + 2000, lista.length)}/${lista.length} numeri…`);
      const r = await allineaNumeri(lista.slice(i, i + 2000));
      trovati += r.trovati; nuovi += r.nuovi;
    }
    const fine = await concludiAllineamento({ file, righe: e.righe, numeri: e.numeri.length, trovati, nuovi, righeNumeroVuoto: e.righeNumeroVuoto });
    setReport({
      titolo: `Allineamento completato in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
      righe: [["Righe lette in fatt_2026", e.righe], ["Numeri distinti", e.numeri.length], ["Già nel registro (segnati presenti)", trovati], ["Nuovi nel registro", nuovi],
        ["Refusi NV- corretti", e.refusiCorretti], ["Righe con Numero vuoto", e.righeNumeroVuoto], ["Esportate ma non ancora in fatt_2026", fine.esportateNonPresenti.length]],
      elenco: fine.esportateNonPresenti.length ? { titolo: "Esportate ma non ancora in fatt_2026 (scaricate ma non incollate?)", voci: fine.esportateNonPresenti } : undefined,
    });
    router.refresh();
  };

  const daFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setLavoro(true); setErrore(null); setReport(null);
    const t0 = Date.now();
    try {
      if (modo === "allinea") {
        const [s] = await leggiAggregato(f, ["fatt_2026"], ["Numero", "DS", "Data"], setStato);
        if (s.errore) throw new Error(s.errore);
        if (s.mancanti.includes("Numero")) throw new Error('nel foglio fatt_2026 manca la colonna "Numero"');
        await allinea(s.righe.map((r) => ({ numero: r.Numero, ds: r.DS, data: r.Data })), f.name, t0);
      } else {
        const fogli = con2025 ? ["fatt_2026", "fatt_2025"] : ["fatt_2026"];
        const letti = await leggiAggregato(f, fogli, undefined, setStato);
        const righe: [string, string | number][] = [];
        for (const s of letti) {
          if (s.errore) { righe.push([s.nome, s.errore]); continue; }
          const e = righeStorico(s.righe);
          let nuove = 0, gia = 0, pdf = 0;
          for (let i = 0; i < e.righe.length; i += 500) {
            setStato(`${s.nome}: invio ${Math.min(i + 500, e.righe.length)}/${e.righe.length} righe…`);
            const r = await caricaStorico({ foglio: s.nome as "fatt_2026" | "fatt_2025", righe: e.righe.slice(i, i + 500) });
            nuove += r.nuove; gia += r.giaPresenti; pdf += r.fontePdf;
          }
          await concludiStorico({ file: f.name, foglio: s.nome, righe: e.righe.length, nuove, giaPresenti: gia, fontePdf: pdf, senzaNumero: e.senzaNumero, scartate: e.scartate });
          righe.push([`${s.nome}: righe lette`, e.righe.length], [`${s.nome}: righe nuove importate`, nuove], [`${s.nome}: già presenti (non duplicate)`, gia],
            [`${s.nome}: di fatture registrate da PDF (non toccate)`, pdf], [`${s.nome}: con Numero vuoto (SENZA-NUMERO-…)`, e.senzaNumero], [`${s.nome}: scartate (senza DS/Data/Descrizione)`, e.scartate]);
        }
        setReport({ titolo: `Carica storico completato in ${((Date.now() - t0) / 1000).toFixed(1)} s`, righe });
        router.refresh();
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setStato(""); setLavoro(false);
    }
  };

  const daTesto = async () => {
    setLavoro(true); setErrore(null); setReport(null);
    try {
      await allinea(numeriDaTesto(incolla).map((n) => ({ numero: n, ds: "", data: null })), "(numeri incollati)", Date.now());
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setStato(""); setLavoro(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setModo("allinea")} className={modo === "allinea" ? "btn-primary" : "btn-secondary"}>Allinea numeri con fatt_2026</button>
        {canStorico && <button type="button" onClick={() => setModo("storico")} className={modo === "storico" ? "btn-primary" : "btn-secondary"}>Carica storico righe</button>}
      </div>
      <p className="text-sm text-ink-muted">
        {modo === "allinea"
          ? "Legge solo la colonna Numero del foglio fatt_2026 e segna nel registro le fatture già incollate. Da fare dopo ogni incolla in fatt_2026."
          : "Importa tutte le righe di fatt_2026 (e, se vuoi, fatt_2025) per il Fatturato e le tariffe del Forecast. Le fatture registrate da PDF non vengono toccate; reimportare lo stesso file non crea doppioni."}
      </p>
      {modo === "storico" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={con2025} onChange={(e) => setCon2025(e.target.checked)} /> anche il foglio fatt_2025</label>}
      <Dropzone titolo="Trascina qui il file AGGREGATO" aiuto={modo === "allinea" ? "fatture.allinea" : "fatture.storico"} accept=".xlsx,.xlsm" lavoro={lavoro} onFiles={daFile}
        testo={<><code>AGGREGATO DETTAGLI FATTURA_conto_economico.xlsx</code> (anche 37 MB): si legge qui nel browser, in background, e non viene inviato al sito.</>} />
      {stato && <p className="text-sm text-ink-muted">{stato}</p>}
      {errore && <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}
      {report && (
        <section className="card bg-ok-soft p-4 md:p-5">
          <h2 className="mb-3 text-[19px] font-semibold text-ok">{report.titolo}</h2>
          <table className="table-base text-sm"><tbody>{report.righe.map(([k, v]) => <tr key={k}><td>{k}</td><td className="font-mono font-semibold">{typeof v === "number" ? v.toLocaleString("it-IT") : v}</td></tr>)}</tbody></table>
          {report.elenco && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-warn">{report.elenco.titolo} ({report.elenco.voci.length})</summary><p className="mt-2 font-mono text-xs">{report.elenco.voci.join(", ")}</p></details>}
        </section>
      )}
      {modo === "allinea" && (
        <section className="card p-4 md:p-5">
          <h2 className="mb-1 text-[19px] font-semibold">Ripiego: incolla la colonna Numero</h2>
          <p className="mb-3 text-sm text-ink-muted">Se il file è troppo pesante per questo PC: in Excel seleziona la colonna Numero di fatt_2026, copia e incolla qui (un numero per riga).</p>
          <textarea className="input h-32 w-full font-mono text-xs" value={incolla} onChange={(e) => setIncolla(e.target.value)} placeholder={"INV-IT3JDBF-0002543\nINV-IT3JDBF-0002544"} />
          <button type="button" className="btn-primary mt-3" disabled={lavoro || !incolla.trim()} onClick={daTesto}>Allinea i numeri incollati</button> <Aiuto k="fatture.allinea.incolla" />
        </section>
      )}
    </div>
  );
}
