/**
 * Aumenti MOG comunicati da Adecco (art. 51 lett. F CCNL ApL), da due file che si completano:
 * - Excel "Aumenti MOG PS.xlsx": Città, CDC, DS, Codice fiscale, Nome, Cognome, N° contratto, Nuova % MOG (senza data);
 * - PDF "Mog_Cambio_Lavoratore_AAAA_MM_PS.pdf": una lettera per lavoratore con n. contratto, "a partire dal",
 *   "passa da X% a Y%" (senza codice fiscale).
 * Si uniscono per numero di contratto; il codice fiscale viene dall'Excel o, se manca, dal file MOG per nome.
 */
import { normCf } from "@/domain/costi/anagrafica";
import { SITO_DS, dsDaSito, stessoNome, type ContrattoMog } from "./mog";

type Cella = string | number | boolean | Date | null | undefined;

export type AumentoLetto = {
  fonte: "excel" | "pdf"; cf: string | null; nome: string; sito: string | null; nContratto: string | null;
  pctPrima: number | null; pctNuova: number; validaDal: string | null; dataLettera: string | null;
};

const testo = (v: Cella) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const pct = (s: string) => { const n = Number(s.replace(/\s|%/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const isoIt = (s: string) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; };
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Righe del foglio Excel (matrice di celle): trova l'intestazione con "Codice fiscale" e "Nuova % MOG". */
export function aumentiDaExcel(righe: Cella[][]): AumentoLetto[] {
  const hi = righe.findIndex((r) => r.some((c) => norm(testo(c)) === "codice fiscale") && r.some((c) => norm(testo(c)).startsWith("nuova % mog")));
  if (hi < 0) return [];
  const h = righe[hi].map((c) => norm(testo(c)));
  const col = (p: string) => h.findIndex((x) => x.startsWith(p));
  const [cCf, cNome, cCogn, cDs, cCitta, cNum, cPct] = [col("codice fiscale"), col("nome"), col("cognome"), col("ds"), col("città"), col("n° contratto"), col("nuova % mog")];
  const out: AumentoLetto[] = [];
  for (const r of righe.slice(hi + 1)) {
    const cf = normCf(testo(r[cCf]));
    const p = typeof r[cPct] === "number" ? (r[cPct] as number) : pct(testo(r[cPct]));
    if (!cf || p === null) continue;
    out.push({
      fonte: "excel", cf, nome: `${testo(r[cNome])} ${testo(r[cCogn])}`.trim(), sito: testo(r[cDs >= 0 ? cDs : cCitta]) || null,
      nContratto: cNum >= 0 ? testo(r[cNum]) || null : null, pctPrima: null, pctNuova: p < 1 ? Math.round(p * 10000) / 100 : p, validaDal: null, dataLettera: null,
    });
  }
  return out;
}

/** Testo del PDF (tutte le pagine): una lettera per "Gent. Sig." con contratto, data di validità e % prima/dopo. */
export function aumentiDaPdf(testoPdf: string): AumentoLetto[] {
  const t = testoPdf.replace(/\s+/g, " ");
  const out: AumentoLetto[] = [];
  for (const blocco of t.split(/Gent\.?\s*(?:Sig\.?|Sig\.ra|Sig\.na)?/i).slice(1)) {
    // intestazione "Nome, Cognome  Città, gg/mm/aaaa": la città è una delle sedi (Santarcangelo di Romagna, …), altrimenti l'ultima parola
    const citta = Object.keys(SITO_DS).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const intest = new RegExp(`^\\s*(.+?)\\s+((?:${citta})[\\wÀ-ÿ' ]*?|[A-ZÀ-Ü][\\wÀ-ÿ']+),\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{4})`, "i").exec(blocco);
    const num = /lettera di assunzione n\.?\s*([\w/.-]+)/i.exec(blocco);
    const dal = /a partire\s+dal\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(blocco);
    const passa = /passa\s+da\s+([\d.,]+)\s*%\s+a\s+([\d.,]+)\s*%/i.exec(blocco);
    if (!passa) continue;
    // "Nome, Cognome" come nell'intestazione della lettera
    const nome = intest ? intest[1].replace(/,/g, " ").replace(/\s+/g, " ").trim() : "";
    out.push({
      fonte: "pdf", cf: null, nome, sito: intest?.[2].trim() ?? null, nContratto: num?.[1] ?? null,
      pctPrima: pct(passa[1]), pctNuova: pct(passa[2])!, validaDal: dal ? isoIt(dal[1]) : null, dataLettera: intest ? isoIt(intest[3]) : null,
    });
  }
  return out;
}

/** Mese dal nome del file (es. Mog_Cambio_Lavoratore_2026_10_PS.pdf → 2026-10-01): data di validità se manca. */
export function meseDaNomeFile(nome: string): string | null {
  const m = /(20\d{2})[_-](0[1-9]|1[0-2])(?!\d)/.exec(nome);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

export type AumentoUnito = {
  cf: string | null; nome: string; station: string | null; nContratto: string | null; pctPrima: number | null; pctNuova: number;
  validaDal: string | null; fonti: ("excel" | "pdf")[]; avvisi: string[];
  /** % del file MOG in uso (per il confronto con la % "prima" della lettera) */
  pctFileMog: number | null;
};

/**
 * Unisce gli aumenti letti (Excel e/o PDF) per numero di contratto, poi per nome; prende il CF dall'Excel o dal
 * file MOG e la data dal PDF (altrimenti `dataDefault`). Gli avvisi dicono cosa controllare prima di salvare.
 */
export function unisciAumenti(letti: AumentoLetto[], contratti: ContrattoMog[], dataDefault: string | null = null): AumentoUnito[] {
  const gruppi: AumentoLetto[][] = [];
  for (const a of letti) {
    const g = gruppi.find((x) => x.some((b) => b.fonte !== a.fonte && ((a.nContratto && b.nContratto === a.nContratto) || (!a.nContratto || !b.nContratto ? stessoNome(a.nome, b.nome) : false))));
    if (g) g.push(a); else gruppi.push([a]);
  }
  return gruppi.map((g) => {
    const ex = g.find((x) => x.fonte === "excel"), pd = g.find((x) => x.fonte === "pdf");
    const avvisi: string[] = [];
    let cf = ex?.cf ?? null;
    const nome = ex?.nome || pd?.nome || "";
    let c = cf ? contratti.find((k) => k.cf === cf) : undefined;
    if (!c) {
      const perNome = contratti.filter((k) => stessoNome(`${k.nome} ${k.cognome}`, nome));
      if (perNome.length === 1) { c = perNome[0]; if (!cf) cf = c.cf; } else if (perNome.length > 1) avvisi.push("più lavoratori con questo nome nel file MOG: serve il codice fiscale");
    }
    if (!c) avvisi.push("non nel file MOG in uso");
    if (!cf) avvisi.push("codice fiscale mancante");
    if (ex && pd && Math.abs(ex.pctNuova - pd.pctNuova) > 0.005) avvisi.push(`nuova % diversa tra Excel (${ex.pctNuova}) e PDF (${pd.pctNuova})`);
    const pctPrima = pd?.pctPrima ?? null;
    if (c?.pctMog != null && pctPrima != null && Math.abs(c.pctMog - pctPrima) > 0.005) avvisi.push(`la lettera dice "da ${pctPrima} %", il file MOG ha ${c.pctMog} %`);
    if (c?.pctMog != null && Math.abs(c.pctMog - (pd ?? ex)!.pctNuova) < 0.005) avvisi.push("il file MOG ha già questa %");
    const validaDal = pd?.validaDal ?? dataDefault;
    if (!pd?.validaDal) avvisi.push(validaDal ? `data dal nome del file (${validaDal.split("-").reverse().join("/")}): controllala` : "data di validità mancante");
    return {
      cf, nome, station: c?.station ?? dsDaSito(ex?.sito ?? pd?.sito ?? ""), nContratto: ex?.nContratto ?? pd?.nContratto ?? null,
      pctPrima, pctNuova: (pd ?? ex)!.pctNuova, validaDal, fonti: g.map((x) => x.fonte), avvisi, pctFileMog: c?.pctMog ?? null,
    };
  });
}
