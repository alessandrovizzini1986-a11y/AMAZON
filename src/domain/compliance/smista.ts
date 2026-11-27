/**
 * "Dove va questo file?": dal nome di un documento arrivato si indovina entità, mese di competenza e folder del portale,
 * e si prepara il nome standard con cui salvarlo. Lavora solo sul nome: il file non lascia il computer di chi lo trascina.
 * È una proposta: chi la usa può sempre correggere entità, mese, folder e nome.
 */
import { MESI } from "./scadenze";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Parole del nome del file → folder del portale. L'ordine conta: le regole più precise stanno prima. */
const REGOLE: [nelFile: RegExp, nelFolder: RegExp][] = [
  [/dilazion/, /^Dilazioni$/],
  [/sanilog/, /SANILOG/],
  [/ebilog/, /EBILOG/],
  [/whc|working.?hours/, /WHC/],
  [/trc|payroll/, /^TRC/],
  [/elenco.*personale|personale.*elenco/, /^Elenco del Personale$/],
  [/durf/, /^DURF$/],
  [/durc/, /D\.U\.R\.C\./],
  [/visura/, /^Visura/],
  [/autorizzazione/, /^Autorizzazione/],
  [/cassetto/, /^Cassetto/],
  [/uniemens|ricevuta.?trasmissione|ricevuta_\d/, /^UNIEMENS$/],
  [/dm.?10/, /^DM10/],
  [/(f24|ssc|pers).*inail|inail.*(f24|quietanz)/, /^F24 Premio INAIL/],
  [/inail|autoliquidazione/, /^INAIL$/],
  [/f24|ssc_|quietanz/, /^F24 INPS/],
  [/lul|cedolone|cedolin|buste?.?paga/, /^LUL/],
  [/certificazione|bonific|attestazion|distint/, /^Attestazioni di pagamento/],
];

export type Indizio = { entita: "PS" | "ADECCO" | null; folder: RegExp | null; anno: number | null; mese: number | null; station: string | null };

const annoOk = (a: number) => a >= 2024 && a <= 2035;

/** Mese di competenza scritto nel nome: 2026-10, 202610, 102026, 10_2026, 1026, "ottobre 2026". */
function meseDalNome(n: string): { anno: number | null; mese: number } | null {
  const prove: [RegExp, (m: RegExpExecArray) => [number, number]][] = [
    [/(?<!\d)(20\d\d)[-_. ]?(0[1-9]|1[0-2])(?!\d)/, (m) => [+m[1], +m[2]]],
    [/(?<!\d)(0[1-9]|1[0-2])[-_. ]?(20\d\d)(?!\d)/, (m) => [+m[2], +m[1]]],
    [/(?<!\d)(0[1-9]|1[0-2])[-_.]?(\d\d)(?!\d)/, (m) => [2000 + +m[2], +m[1]]],
  ];
  for (const [re, f] of prove) { const m = re.exec(n); if (m) { const [anno, mese] = f(m); if (annoOk(anno)) return { anno, mese }; } }
  const i = MESI.findIndex((x) => n.includes(norm(x)) || new RegExp(`(?<![a-z])${norm(x).slice(0, 3)}(?![a-z])`).test(n));
  // "uniemens novembre": il mese c'è, l'anno no. Lo decide il registro (la riga aperta più vecchia di quel mese)
  if (i >= 0) { const a = /(?<!\d)(20\d\d)(?!\d)/.exec(n) ?? /(?<!\d)(\d\d)(?!\d)/.exec(n); const anno = a ? (a[1].length === 2 ? 2000 + +a[1] : +a[1]) : NaN; return { anno: annoOk(anno) ? anno : null, mese: i + 1 }; }
  return null;
}

export function indizi(nomeFile: string): Indizio {
  const n = norm(nomeFile.replace(/\.[a-z0-9]{2,5}$/i, ""));
  const regola = REGOLE.find(([f]) => f.test(n));
  const adecco = /adecco|(?<![a-z])ade(?![a-z])|(?<![a-z])ai(?![a-z])|(?<![a-z])std(?![a-z])|(?<![a-z])sl(?![a-z])|somministr/.test(n);
  const ps = /(?<![a-z])ps(?![a-z])|professional|(?<![a-z])prof(?![a-z])|(?<![a-z])sic(?![a-z])/.test(n);
  const st = /(?<![a-z0-9])(d[a-z]{2}\d)(?![a-z0-9])/.exec(n);
  const quando = meseDalNome(n);
  return { entita: adecco ? "ADECCO" : ps ? "PS" : null, folder: regola?.[1] ?? null, anno: quando?.anno ?? null, mese: quando?.mese ?? null, station: st ? st[1].toUpperCase() : null };
}

export type RigaSmista = { id: string; entita: string; area: string; anno: number; mese: number; folder: string; aperta: boolean };

/**
 * La riga del registro proposta per un file. Se il nome non dice il mese si prende il mese più vecchio in cui quel folder
 * è ancora aperto; se non dice l'entità, quella che ha il folder aperto (prima Professional Solutions).
 */
export function proponi(nomeFile: string, righe: RigaSmista[]): { riga: RigaSmista | null; indizio: Indizio; certo: boolean } {
  const i = indizi(nomeFile);
  if (!i.folder) return { riga: null, indizio: i, certo: false };
  const cand = righe.filter((r) => i.folder!.test(r.folder) && (!i.entita || r.entita === i.entita) && (i.mese === null || (r.mese === i.mese && (i.anno === null || r.anno === i.anno))));
  const ordine = (r: RigaSmista) => `${r.aperta ? 0 : 1}|${r.anno}-${String(r.mese).padStart(2, "0")}|${r.entita === "PS" ? 0 : 1}|${r.area === "Giuslavoro" ? 0 : 1}`;
  const riga = [...cand].sort((a, b) => ordine(a).localeCompare(ordine(b)))[0] ?? null;
  return { riga, indizio: i, certo: !!riga && !!i.entita && i.mese !== null && i.anno !== null };
}

const SEGNAPOSTO = /GGMMAAAA|GG\.MM\.AA|AAMMGG|AAAA-MM|MMAAAA|AAAAMM|MMAA|AAAA|<MESE>|<DS>|<[^>]+>|Qn/g;
const estensione = (nome: string) => /\.([a-z0-9]{2,5})$/i.exec(nome)?.[1].toLowerCase() ?? "";

/**
 * I nomi standard del folder riempiti con mese e station. Un folder può avere più nomi ("LUL… + Cedolone…").
 * `daCompletare`: restano pezzi che il sito non può sapere (protocollo, data di validità…), da scrivere a mano.
 * L'estensione è sempre quella del file vero. Senza nome standard propone Folder_ENTITÀ_MMAA.
 */
export function nomiStandard(modello: string, p: { entita: string; folder: string; anno: number; mese: number; station: string | null; originale: string }): { nome: string; daCompletare: boolean }[] {
  const mm = String(p.mese).padStart(2, "0"), aaaa = String(p.anno), aa = aaaa.slice(2), ext = estensione(p.originale);
  const conExt = (s: string) => { const base = s.replace(/\.[a-z0-9]{2,5}$/i, "").trim(); return ext ? `${base}.${ext}` : base; };
  const pulito = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-");
  const modelli = /template portale/i.test(modello) || !modello.trim() ? [] : modello.split(/\s\+\s|,\s+/).map((s) => s.trim()).filter(Boolean);
  if (!modelli.length) return [{ nome: conExt(pulito(`${p.folder.replace(/\s*[–-]\s*/g, "_").replace(/\./g, "")}_${p.entita}_${mm}${aa}`)), daCompletare: false }];
  return modelli.map((m, k) => {
    let manca = false;
    // "_SL.pdf" dopo una virgola è la variante del nome precedente
    const intero = k > 0 && /^[_-]/.test(m) ? modelli[0].replace(/[_-][A-Za-z0-9]+(\.[a-z0-9]{2,5})?$/, "") + m : m;
    const nome = intero.replace(SEGNAPOSTO, (t) => {
      if (t === "AAAA-MM") return `${aaaa}-${mm}`;
      if (t === "MMAAAA") return `${mm}${aaaa}`;
      if (t === "AAAAMM") return `${aaaa}${mm}`;
      if (t === "MMAA") return `${mm}${aa}`;
      if (t === "AAAA") return aaaa;
      if (t === "<MESE>") return MESI[p.mese - 1];
      if (t === "Qn") return `Q${Math.ceil(p.mese / 3)}`;
      if (t === "<DS>" && p.station) return p.station;
      manca = true; return t;
    });
    return { nome: conExt(pulito(nome).replace(/-([^-]+)-/g, (tutto, x: string) => (/^(DS|protocollo|n|matricola)$/.test(x) ? `<${x}>` : tutto))), daCompletare: manca };
  });
}

/** Avvisi prima di caricare sul portale: formato e peso. */
export function avvisiFile(formato: string, nome: string, byte: number): string[] {
  const ext = estensione(nome), a: string[] = [];
  if (/pdf/i.test(formato) && ext !== "pdf") a.push(`Il folder vuole un PDF, questo è un file .${ext || "senza estensione"}`);
  if (/xlsx/i.test(formato) && ext !== "xlsx") a.push(`Il folder vuole un Excel .xlsx, questo è un file .${ext || "senza estensione"}`);
  if (byte > 2 * 1024 * 1024) a.push(`Pesa ${(byte / 1048576).toFixed(1)} MB: il portale accetta al massimo 2 MB per file`);
  return a;
}
