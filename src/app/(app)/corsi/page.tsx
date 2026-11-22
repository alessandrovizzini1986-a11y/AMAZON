import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { CORSI } from "@/content/corsi";
import { chiaveLezione, statoLezioni } from "@/domain/corsi/corsi";
import { progresso, progressoDiTutti } from "./dati";

export const dynamic = "force-dynamic";
export const metadata = { title: "Corsi — FleetDSP" };

const data = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });

export default async function CorsiPage() {
  const user = await requireUser();
  const tutor = can(user, "training.admin");
  const [mio, tutti] = await Promise.all([progresso(user.id), tutor ? progressoDiTutti() : Promise.resolve([])]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Aiuto" title="Corsi" subtitle="Lezioni brevi, una regola alla volta, con gli esercizi. La lezione dopo si apre quando fai giusti tutti gli esercizi di quella prima. Quelle superate restano aperte per ripassare." />

      {CORSI.map((c) => {
        const superate = new Set(c.lezioni.filter((l) => mio.get(chiaveLezione(c.id, l.slug))?.superataIl).map((l) => l.slug));
        const stati = statoLezioni(c, superate);
        const prossima = c.lezioni[stati.indexOf("aperta")];
        const minuti = c.lezioni.reduce((s, l) => s + l.minuti, 0);
        return (
          <section key={c.id} className="card flex flex-col gap-4 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <h2 className="text-[22px] font-semibold">{c.titolo}</h2>
                <p className="mt-1 text-sm text-ink-muted">{c.descrizione}</p>
                <p className="mt-1 text-sm text-ink-muted"><b>Per chi:</b> {c.perChi} · {c.lezioni.length} lezioni, circa {minuti} minuti di lettura più gli esercizi.</p>
              </div>
              {prossima
                ? <Link href={`/corsi/${c.id}/${prossima.slug}`} className="btn-primary">{superate.size ? "Continua" : "Inizia"}: {prossima.titolo}</Link>
                : <span className="rounded-full bg-ok-soft px-4 py-2 text-sm font-semibold text-ok">Corso completato ✓</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={c.lezioni.length} aria-valuenow={superate.size} aria-label="Lezioni superate">
              <div className="h-full bg-brand" style={{ width: `${(superate.size / c.lezioni.length) * 100}%` }} />
            </div>
            <ol className="flex flex-col">
              {c.lezioni.map((l, i) => {
                const st = stati[i], p = mio.get(chiaveLezione(c.id, l.slug));
                const riga = (
                  <>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${st === "superata" ? "bg-ok-soft text-ok" : st === "aperta" ? "bg-brand text-white" : "bg-surface-sunken text-ink-faint"}`}>{st === "superata" ? "✓" : i + 1}</span>
                    <span className="flex-1"><span className={`font-medium ${st === "chiusa" ? "text-ink-faint" : ""}`}>{l.titolo}</span><span className="block text-xs text-ink-muted">{l.obiettivo}</span></span>
                    <span className="whitespace-nowrap text-xs text-ink-muted">{st === "superata" && p?.superataIl ? `superata il ${data(p.superataIl)}${p.tentativi > 1 ? ` · ${p.tentativi} tentativi` : ""}` : st === "aperta" ? `${l.minuti} min` : "si apre dopo"}</span>
                  </>
                );
                return (
                  <li key={l.slug} className="border-t border-line first:border-t-0">
                    {st === "chiusa"
                      ? <div className="flex items-center gap-3 px-1 py-3" aria-disabled="true">{riga}{tutor && <Link href={`/corsi/${c.id}/${l.slug}?ripasso=1`} className="text-xs underline">apri in ripasso</Link>}</div>
                      : <Link href={`/corsi/${c.id}/${l.slug}`} className="flex items-center gap-3 rounded-control px-1 py-3 hover:bg-surface">{riga}</Link>}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {tutor && (
        <section className="card overflow-x-auto p-4 md:p-6">
          <h2 className="text-[19px] font-semibold">Avanzamento di tutti</h2>
          <p className="mb-3 text-sm text-ink-muted">Lo vede solo chi fa da tutor. Il numero piccolo è quanti tentativi sono serviti.</p>
          {CORSI.map((c) => (
            <table key={c.id} className="table-base text-sm">
              <thead><tr><th>{c.titolo}</th><th>Ruolo</th>{c.lezioni.map((l, i) => <th key={l.slug} title={l.titolo} className="text-center">{i + 1}</th>)}<th className="text-right">Superate</th><th>Ultima attività</th></tr></thead>
              <tbody>
                {tutti.map((u) => {
                  const r = new Map(u.righe.map((x) => [x.lezione, x]));
                  const fatte = c.lezioni.filter((l) => r.get(chiaveLezione(c.id, l.slug))?.superataIl).length;
                  const ultima = u.righe.filter((x) => x.lezione.startsWith(`${c.id}/`)).map((x) => x.ultimoIl).sort().at(-1);
                  return (
                    <tr key={u.id} className={fatte === 0 && !ultima ? "text-ink-faint" : ""}>
                      <td className="font-medium">{u.name}</td><td className="text-xs">{u.role}</td>
                      {c.lezioni.map((l) => { const x = r.get(chiaveLezione(c.id, l.slug)); return <td key={l.slug} className={`text-center ${x?.superataIl ? "bg-ok-soft text-ok" : x ? "bg-warn-soft text-warn" : ""}`} title={l.titolo}>{x?.superataIl ? "✓" : x ? "…" : ""}{x && x.tentativi > 1 ? <sup className="ml-0.5">{x.tentativi}</sup> : null}</td>; })}
                      <td className="text-right font-mono">{fatte}/{c.lezioni.length}</td><td className="text-xs">{ultima ? data(ultima) : "mai iniziato"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        </section>
      )}
    </div>
  );
}
