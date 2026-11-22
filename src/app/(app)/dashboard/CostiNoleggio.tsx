"use client";

import { useState } from "react";
import { SelettoreMese } from "@/components/SelettoreMese";
import type { Confronto, RigaConfronto } from "@/domain/flotta/costiMese";

// useGrouping "always": in italiano i numeri di 4 cifre altrimenti restano senza punto (3831,00)
const eur = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as Intl.NumberFormatOptions);
const delta = (d: number | null, base: number | null) => {
  if (d === null) return { testo: "—", cls: "text-ink-faint" };
  if (Math.abs(d) < 0.005) return { testo: "=", cls: "text-ink-muted" };
  const pct = base ? ` (${d > 0 ? "+" : "−"}${Math.abs((d / base) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} %)` : "";
  return { testo: `${d > 0 ? "+" : "−"}${eur(Math.abs(d))}${pct}`, cls: d > 0 ? "text-danger" : "text-ok" };
};
const nomeMail = (c: string) => (c === "Avis" ? "AVIS MAGGIORE" : c.toUpperCase());

type Blocco = { titolo: string; etichetta: string; dati: Confronto };

/** Costo dei furgoni per compagnia di noleggio, Amazon e GLS: è la tabella della mail "Stima costi". */
export function CostiNoleggio({ mese, nome, corrente, blocchi, fonte, precNome, annoNome, haStorico }: {
  mese: string; nome: string; corrente: boolean; blocchi: Blocco[]; fonte: "ADESSO" | "SITO" | "MAIL" | "NESSUNO"; precNome: string; annoNome: string; haStorico: boolean;
}) {
  const [esito, setEsito] = useState("");
  const stimati = blocchi.reduce((s, b) => s + b.dati.totale.stimati, 0);

  const copia = async () => {
    const cella = "padding:3px 8px;border:1px solid #8ea9db;font-family:Calibri,Arial,sans-serif;font-size:11pt";
    const tabella = (b: Blocco) => `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;display:inline-table;margin-right:16px;vertical-align:top"><tr><td colspan="2" style="${cella};background:#4472c4;color:#fff;font-weight:bold">FORECAST COSTI VAN ${b.etichetta} ${nome.toUpperCase()}</td></tr>${b.dati.righe.filter((r) => r.canone !== 0).map((r, i) => `<tr style="background:${i % 2 ? "#fff" : "#d9e1f2"}"><td style="${cella}">Costi ${nomeMail(r.compagnia)}</td><td style="${cella};text-align:right">${eur(r.canone)} €</td></tr>`).join("")}<tr><td style="${cella}">Totale costi mezzi</td><td style="${cella};text-align:right">${eur(b.dati.totale.canone)} €</td></tr></table>`;
    const html = blocchi.map(tabella).join("");
    const testo = blocchi.map((b) => [`FORECAST COSTI VAN ${b.etichetta} ${nome.toUpperCase()}`, ...b.dati.righe.filter((r) => r.canone !== 0).map((r) => `Costi ${nomeMail(r.compagnia)}\t${eur(r.canone)} €`), `Totale costi mezzi\t${eur(b.dati.totale.canone)} €`].join("\n")).join("\n\n");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([testo], { type: "text/plain" }) })]);
      setEsito("Tabelle copiate: incollale nella mail ✓");
    } catch { try { await navigator.clipboard.writeText(testo); setEsito("Copiato come testo ✓"); } catch { setEsito("Copia non riuscita"); } }
    window.setTimeout(() => setEsito(""), 4000);
  };

  const riga = (r: RigaConfronto, forte = false) => {
    const p = delta(r.dPrec, r.prec), a = delta(r.dAnno, r.anno);
    return (
      <tr key={r.compagnia} className={forte ? "font-bold" : ""}>
        <td className="py-2">{r.compagnia}{r.stimati > 0 && <span className="text-warn" title={`${r.stimati} mezzi con canone stimato`}> *</span>}</td>
        <td className="py-2 text-right font-mono">{r.mezzi === null ? "—" : r.mezzi.toLocaleString("it-IT", { useGrouping: "always" } as Intl.NumberFormatOptions)}</td>
        <td className="py-2 text-right font-mono">{eur(r.canone)}</td>
        <td className={`whitespace-nowrap py-2 text-right font-mono text-xs ${p.cls}`}>{p.testo}</td>
        <td className={`whitespace-nowrap py-2 text-right font-mono text-xs ${a.cls}`}>{a.testo}</td>
      </tr>
    );
  };

  return (
    <section className="card mt-6 flex flex-col gap-4 p-4 md:p-[22px]" aria-label="Costo dei furgoni per compagnia di noleggio">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-[19px] font-semibold">Costo dei furgoni per compagnia di noleggio</h2>
          <p className="text-sm text-ink-muted">{fonte === "ADESSO" ? `${nome}: la flotta di adesso, canone intero.` : fonte === "SITO" ? `${nome}: ultima fotografia salvata dal sito in quel mese.` : fonte === "MAIL" ? `${nome}: importi presi dalla tua mail di stima costi (numero dei mezzi non noto).` : `${nome}: nessun dato salvato per questo mese.`} Sostitutivi e dismessi esclusi; ALD comprende ALD MT.</p>
        </div>
        <SelettoreMese value={mese} href="/dashboard" ricorda={false} da="2025-01" mesiAvanti={0} />
        <button type="button" className="btn-secondary h-10" onClick={copia} disabled={fonte === "NESSUNO"}>Copia per la mail</button>
      </div>
      {esito && <p className="text-sm font-semibold text-ok" role="status">{esito}</p>}
      {fonte === "NESSUNO" ? <p className="text-sm text-ink-muted">Lo storico parte da quando il sito ha iniziato a salvarlo. Per i mesi prima servono le mail di stima costi: mandale e vengono inserite.</p> : (
        <div className="grid gap-6 lg:grid-cols-2">
          {blocchi.map((b) => (
            <div key={b.titolo} className="overflow-x-auto">
              <h3 className="mb-1 font-semibold">{b.titolo}</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted"><th className="py-2 font-semibold">Compagnia</th><th className="py-2 text-right font-semibold">Mezzi</th><th className="py-2 text-right font-semibold">Canone €</th><th className="py-2 text-right font-semibold">su {precNome}</th><th className="py-2 text-right font-semibold">su {annoNome}</th></tr></thead>
                <tbody className="[&>tr]:border-b [&>tr]:border-[#eef1f4]">{b.dati.righe.map((r) => riga(r))}{riga(b.dati.totale, true)}</tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-ink-muted">
        {stimati > 0 && <><span className="text-warn">*</span> {stimati} mezzi hanno un canone stimato dal sito (nuovi arrivi senza tariffa nella Lista Targhe): la prima fattura lo sostituisce. </>}
        Rosso = costa di più del mese di confronto, verde = di meno; «—» = per quel mese non c&apos;è un dato salvato.
        {corrente ? " Il mese in corso si aggiorna da solo a ogni cambio della flotta; a fine mese resta salvato com'è." : ""}{!haStorico && corrente ? " Lo storico comincia da questo mese." : ""}
      </p>
    </section>
  );
}
