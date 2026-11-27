/** Testi delle mail di richiesta e di sollecito (si aprono nel programma di posta: il sito non invia nulla). */
import { it, nomeMese } from "./scadenze";

export type RigaMail = { folder: string; area: string; documento: string; formato: string; nomeFileStandard: string; scadenzaInterna: string | null; scadenzaPortale: string | null; dataRichiesta: string | null };
const ENTITA: Record<string, string> = { PS: "Professional Solutions Srl", ADECCO: "Adecco S.p.a.-Prof" };
export const nomeEntita = (e: string) => ENTITA[e] ?? e;

/** Dove va caricato sul portale: entità → area → mese di competenza → folder (il nome esatto del riquadro). */
export const percorsoFolder = (entita: string, area: string, anno: number, mese: number, folder: string) => `${nomeEntita(entita)} → ${area} → ${nomeMese(anno, mese)} → «${folder}»`;

/** Un documento nella mail: cosa serve, in quale folder del portale va, con che nome e entro quando. */
function voce(r: RigaMail, i: number, p: { entita: string; anno: number; mese: number }, conScadenza = true): string[] {
  return [
    `${i + 1}. ${r.documento} (${r.formato})`,
    `   Folder del portale: ${percorsoFolder(p.entita, r.area, p.anno, p.mese, r.folder)}`,
    ...(r.nomeFileStandard ? [`   Nome del file: ${r.nomeFileStandard}`] : []),
    ...(conScadenza && r.scadenzaInterna ? [`   Entro il ${it(r.scadenzaInterna)}`] : []),
  ];
}

export function mailRichiesta(p: { nome: string; entita: string; anno: number; mese: number; righe: RigaMail[]; link: string }) {
  const m = nomeMese(p.anno, p.mese);
  return {
    oggetto: `Compliance Tool Amazon – documenti ${m} – ${nomeEntita(p.entita)}`,
    testo: [
      `Ciao ${p.nome},`, `per il Compliance Tool Amazon servono i documenti di competenza ${m} per ${nomeEntita(p.entita)}:`, "",
      ...p.righe.flatMap((r, i) => voce(r, i, p)), "",
      "Quando rispondi allega un file per documento e lascia nella mail il nome del folder: chi riceve sa subito dove caricarlo.",
      `Fac-simile e scadenze sono su ${p.link}. Dopo il caricamento sul portale metti la spunta "Caricato" sulla riga.`,
      "Requisiti: file PDF originale (non scansione dove possibile), massimo 2 MB per file.", "Il portale chiude i folder alla scadenza e non li riapre.", "Grazie",
    ].join("\n"),
  };
}

export function mailSollecito(p: { nome: string; entita: string; anno: number; mese: number; righe: RigaMail[] }) {
  const m = nomeMese(p.anno, p.mese);
  const chiude = p.righe.map((r) => r.scadenzaPortale).filter((x): x is string => !!x).sort()[0], entro = p.righe.map((r) => r.scadenzaInterna).filter((x): x is string => !!x).sort()[0];
  return {
    oggetto: `SOLLECITO – Compliance Tool Amazon – ${m} – ${nomeEntita(p.entita)}`,
    testo: [
      `Ciao ${p.nome},`, `mancano ancora questi documenti di ${m}${chiude ? `, il portale chiude il ${it(chiude)}` : ""}:`, "",
      ...p.righe.flatMap((r, i) => [...voce(r, i, p, false), ...(r.dataRichiesta ? [`   Richiesto il ${it(r.dataRichiesta)}`] : [])]), "",
      `${entro ? `Servono entro il ${it(entro)}. ` : ""}Grazie`,
    ].join("\n"),
  };
}

export const mailto = (email: string, m: { oggetto: string; testo: string }) => `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(m.oggetto)}&body=${encodeURIComponent(m.testo)}`;
