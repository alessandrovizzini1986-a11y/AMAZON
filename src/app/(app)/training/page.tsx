import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPiano } from "@/lib/training/piano";
import { avanzamentoPercorso, dataLunga, giornoDiOggi, moduloSuperato } from "@/domain/training/piano";
import { extraPerGiorno, oggiRoma, soggetto, statoUtente } from "./dati";
import { Barra, STATO_GIORNO } from "./ui";

export const dynamic = "force-dynamic";

export default async function TrainingHome({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const user = await requireUser();
  const { u } = await searchParams;
  const piano = getPiano();
  const { sogg, stagiste } = await soggetto(user, u);
  const [stato, extra] = await Promise.all([statoUtente(sogg.id), extraPerGiorno()]);
  const av = avanzamentoPercorso(piano, stato, extra);
  const oggi = giornoDiOggi(piano, oggiRoma());
  const q = sogg.seStesso ? "" : `?u=${sogg.id}`;
  const admin = can(user, "training.admin");
  const g1 = piano.giorni[0];

  return (
    <div className="flex flex-col gap-6">
      {/* avanzamento sempre in vista sotto la barra del sito */}
      <div className="sticky top-14 z-10 -mx-4 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:top-[68px] md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[15px] font-semibold">{piano.titolo}{!sogg.seStesso && <span className="font-normal text-ink-muted"> · {sogg.nome}</span>}</p>
          <p className="text-sm text-ink-muted"><span className="font-semibold text-ink">{av.fatte}/{av.totali}</span> attività · <span className="font-semibold text-ink">{av.giorniCompleti}/{av.nGiorni}</span> giorni</p>
        </div>
        <div className="mt-2"><Barra fatte={av.fatte} totali={av.totali} label="Attività fatte sul totale" /></div>
      </div>

      {admin && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {stagiste.length ? stagiste.map((s) => (
            <Link key={s.id} href={`/training?u=${s.id}`} className={`rounded-control border px-3 py-2 ${s.id === sogg.id ? "border-info bg-info-soft font-semibold text-info" : "border-line bg-surface-raised"}`}>{s.nome}</Link>
          )) : <span className="text-ink-muted">Nessun utente STAGISTA: vedi il tuo percorso di prova. Crealo in Utenti.</span>}
          <Link href={`/training/admin${q}`} className="btn-secondary ml-auto">Pannello admin</Link>
        </div>
      )}

      {oggi.stato === "prima" ? (
        <section className="card overflow-hidden">
          <div className="bg-info-soft px-5 py-6 md:px-8 md:py-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-info">Si parte</p>
            <h1 className="mt-1 text-[26px] font-bold leading-tight md:text-[32px]">{dataLunga(g1.date)} alle 9:00</h1>
            <p className="mt-2 max-w-2xl text-ink-muted">{piano.giorni.length} giorni, {av.totali} attività, {piano.moduli.length} moduli. Il primo giorno: {g1.title.toLowerCase()}.</p>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-4 md:px-8">
            <Link href={`/training/1${q}`} className="btn-primary">Guarda il giorno 1</Link>
            {g1.sezioni[0] && <Link href={`/vademecum/${g1.sezioni[0]}`} className="btn-secondary">Inizia dal vademecum</Link>}
          </div>
        </section>
      ) : (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-info">{oggi.stato === "oggi" ? "Oggi" : oggi.stato === "prossimo" ? "Prossimo giorno" : "Percorso concluso"}</p>
            <p className="text-xl font-bold">Giorno {oggi.day} · {piano.giorni[oggi.day - 1].title}</p>
          </div>
          <Link href={`/training/${oggi.day}${q}`} className="btn-primary">Apri il giorno {oggi.day}</Link>
        </section>
      )}

      <section aria-labelledby="t-giorni">
        <h2 id="t-giorni" className="mb-3 text-[19px] font-semibold">I {piano.giorni.length} giorni</h2>
        <ol className="tr-snap -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
          {piano.giorni.map((g) => {
            const a = av.giorni[g.day - 1];
            const eOggi = g.day === oggi.day && oggi.stato !== "finito";
            return (
              <li key={g.day} className="w-[80vw] max-w-[320px] shrink-0 md:w-auto md:max-w-none">
                <Link href={`/training/${g.day}${q}`} className={`card flex h-full flex-col gap-2 p-4 transition-shadow hover:shadow-lift ${eOggi ? "ring-2 ring-info" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Giorno {g.day} · {dataLunga(g.date).replace(/^(\S+) /, (_, w: string) => `${w.slice(0, 3)} `)}</span>
                    <span className={STATO_GIORNO[a.stato]}>{a.stato}</span>
                  </div>
                  <p className="text-[17px] font-semibold leading-snug">{g.title}</p>
                  <p className="text-sm text-ink-muted">{g.modulo}</p>
                  <div className="mt-auto flex items-center gap-3 pt-1">
                    <div className="flex-1"><Barra fatte={a.fatte} totali={a.totali} ok={a.completo} /></div>
                    <span className="text-xs tabular-nums text-ink-muted">{a.fatte}/{a.totali}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="t-moduli">
        <h2 id="t-moduli" className="mb-3 text-[19px] font-semibold">Moduli</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {piano.moduli.map((m) => {
            const ok = moduloSuperato(m, stato);
            const giorno = piano.giorni.find((g) => g.attivita.some((x) => x.id === m.valida));
            return (
              <li key={m.id} className="card flex gap-4 p-4">
                <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${ok ? "tr-acceso bg-ok text-ink-inverse" : "bg-surface-sunken text-ink-faint"}`}>{ok ? "✓" : m.titolo.charAt(0)}</span>
                <div className="min-w-0">
                  <p className="font-semibold">{m.titolo} <span className={ok ? "badge-ok ml-1" : "badge-neutral ml-1"}>{ok ? "superato" : "da superare"}</span></p>
                  <p className="mt-1 text-sm text-ink-muted"><span className="font-medium text-ink">Esame:</span> {m.esame}</p>
                  {giorno && <Link href={`/training/${giorno.day}${q}#${m.valida}`} className="mt-1 inline-block text-sm text-info underline-offset-2 hover:underline">Giorno {giorno.day}</Link>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
