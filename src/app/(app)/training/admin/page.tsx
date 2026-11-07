import Link from "next/link";
import { SchedePagina } from "@/components/SchedePagina";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPiano } from "@/lib/training/piano";
import { attivitaGiorno, avanzamentoPercorso, idSera, moduloSuperato } from "@/domain/training/piano";
import { PageHeader } from "@/components/ui";
import { extraPerGiorno, noteUtente, soggetto, statoUtente } from "../dati";
import { Barra, STATO_GIORNO, TIPO } from "../ui";
import { BottoneValida } from "./BottoneValida";

export const dynamic = "force-dynamic";

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : "");

export default async function TrainingAdmin({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const user = await requireUser();
  if (!can(user, "training.admin")) redirect("/training");
  const { u } = await searchParams;
  const piano = getPiano();
  const { sogg, stagiste } = await soggetto(user, u);
  const [stato, extra, note] = await Promise.all([statoUtente(sogg.id), extraPerGiorno(), noteUtente(sogg.id)]);
  const av = avanzamentoPercorso(piano, stato, extra);
  const q = sogg.seStesso ? "" : `?u=${sogg.id}`;
  const daValidare = piano.giorni.flatMap((g) => attivitaGiorno(g, extra.get(g.day)).filter((a) => a.tipo === "check" && stato.get(a.id)?.done && !stato.get(a.id)?.validated).map((a) => ({ g, a })));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Training · admin" title={`Percorso di ${sogg.nome}`} subtitle={sogg.seStesso ? "Nessun utente con ruolo STAGISTA: stai vedendo il tuo percorso di prova. Crealo in Utenti." : `${av.fatte}/${av.totali} attività · ${av.giorniCompleti}/${av.nGiorni} giorni completati`} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {stagiste.map((s) => <Link key={s.id} href={`/training/admin?u=${s.id}`} className={`rounded-control border px-3 py-2 ${s.id === sogg.id ? "border-info bg-info-soft font-semibold text-info" : "border-line bg-surface-raised"}`}>{s.nome}</Link>)}
        <Link href={`/training${q}`} className="btn-secondary">Vista percorso</Link>
        <a href={`/training/admin/csv${q}`} className="btn-secondary" download>Esporta CSV</a>
      </div>
      <div className="max-w-xl"><Barra fatte={av.fatte} totali={av.totali} /></div>

      <SchedePagina schede={[{ id: "validare", label: `Da validare (${daValidare.length})` }, { id: "giorni", label: "Giorno per giorno" }]} />
      <section data-scheda="validare" className="card p-4 md:p-5">
        <h2 className="font-semibold">Da validare ({daValidare.length})</h2>
        {daValidare.length ? (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {daValidare.map(({ g, a }) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-semibold">G{g.day}</span><span className="min-w-0 flex-1">{a.testo}</span>
                <BottoneValida userId={sogg.id} activityId={a.id} validato={false} />
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-ink-muted">Nessun check fatto in attesa di validazione.</p>}
      </section>

      <section data-scheda="validare" className="card p-4 md:p-5">
        <h2 className="font-semibold">Moduli</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {piano.moduli.map((m) => <li key={m.id} className={moduloSuperato(m, stato) ? "badge-ok" : "badge-neutral"}>{m.titolo}: {moduloSuperato(m, stato) ? "superato" : "da superare"}</li>)}
        </ul>
      </section>

      {piano.giorni.map((g) => {
        const att = attivitaGiorno(g, extra.get(g.day));
        const a = av.giorni[g.day - 1];
        const nota = note.get(g.day);
        return (
          <section key={g.day} data-scheda="giorni" className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <Link href={`/training/${g.day}${q}`} className="font-semibold text-info underline-offset-2 hover:underline">Giorno {g.day} · {g.title}</Link>
              <span className={STATO_GIORNO[a.stato]}>{a.stato} · {a.fatte}/{a.totali}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Attività</th><th>Tipo</th><th>Fatto</th><th>Validato</th></tr></thead>
                <tbody>
                  {att.map((x) => {
                    const s = stato.get(x.id);
                    return (
                      <tr key={x.id}>
                        <td className="min-w-[260px]"><span className="font-mono text-xs text-ink-faint">{x.id}{x.extra ? " · extra" : ""}</span><br />{x.testo}</td>
                        <td><span className={TIPO[x.tipo].cls}>{TIPO[x.tipo].label}</span></td>
                        <td className="whitespace-nowrap">{s?.done ? <span className="text-ok">✓ {quando(s.doneAt)}</span> : "—"}</td>
                        <td className="whitespace-nowrap">{x.tipo === "check" ? <BottoneValida userId={sogg.id} activityId={x.id} validato={!!s?.validated} /> : ""}</td>
                      </tr>
                    );
                  })}
                  {g.sera.leggi.length > 0 && (
                    <tr><td>Lettura serale: {g.sera.leggi.join(", ")}</td><td><span className="badge-neutral">Sera</span></td><td>{stato.get(idSera(g.day))?.done ? <span className="text-ok">✓ letto</span> : "—"}</td><td /></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-3 text-sm">
              <span className="font-semibold">Note di giornata</span>{nota && <span className="text-xs text-ink-muted"> · {quando(nota.updatedAt)}</span>}
              <p className="mt-1 whitespace-pre-wrap">{nota?.text || <span className="text-ink-muted">—</span>}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
