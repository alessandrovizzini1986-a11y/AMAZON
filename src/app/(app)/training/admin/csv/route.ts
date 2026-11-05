import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { getPiano } from "@/lib/training/piano";
import { attivitaGiorno, idSera } from "@/domain/training/piano";
import { extraPerGiorno, noteUtente, soggetto, statoUtente } from "../../dati";

export const dynamic = "force-dynamic";

const cella = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Stato del percorso della stagista: una riga per attività (piano, extra, lettura serale) + note di giornata. CSV con ";" per Excel italiano. */
export async function GET(req: Request) {
  const user = await requireUser();
  assertCan(user, "training.admin");
  const u = new URL(req.url).searchParams.get("u") ?? undefined;
  const piano = getPiano();
  const { sogg } = await soggetto(user, u);
  const [stato, extra, note] = await Promise.all([statoUtente(sogg.id), extraPerGiorno(), noteUtente(sogg.id)]);
  const righe: unknown[][] = [["giorno", "data", "id", "tipo", "chi", "durata_min", "testo", "fatto", "fatto_il", "validato", "validato_il", "nota_giornata"]];
  for (const g of piano.giorni) {
    const n = note.get(g.day)?.text ?? "";
    for (const a of attivitaGiorno(g, extra.get(g.day))) {
      const s = stato.get(a.id);
      righe.push([g.day, g.date, a.id, a.tipo, a.chi, a.durata, a.testo, s?.done ? "sì" : "no", s?.doneAt ?? "", a.tipo === "check" ? (s?.validated ? "sì" : "no") : "", s?.validatedAt ?? "", n]);
    }
    if (g.sera.leggi.length) { const s = stato.get(idSera(g.day)); righe.push([g.day, g.date, idSera(g.day), "sera", sogg.nome, "", `Lettura: ${g.sera.leggi.join(", ")}`, s?.done ? "sì" : "no", s?.doneAt ?? "", "", "", n]); }
  }
  const csv = "﻿" + righe.map((r) => r.map(cella).join(";")).join("\r\n");
  const nome = `training_${sogg.nome.replace(/[^A-Za-z0-9]+/g, "_")}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"` } });
}
