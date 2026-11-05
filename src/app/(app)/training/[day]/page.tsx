import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPiano, indiceVademecum, linkVademecum } from "@/lib/training/piano";
import { attivitaGiorno, dataLunga, giornoDiOggi, idSera } from "@/domain/training/piano";
import { extraPerGiorno, noteUtente, oggiRoma, soggetto, statoUtente } from "../dati";
import { GiornoClient, type CardAttivita } from "./GiornoClient";

export const dynamic = "force-dynamic";

export default async function TrainingGiorno({ params, searchParams }: { params: Promise<{ day: string }>; searchParams: Promise<{ u?: string }> }) {
  const user = await requireUser();
  const day = Number((await params).day);
  const { u } = await searchParams;
  const piano = getPiano();
  const g = piano.giorni.find((x) => x.day === day);
  if (!g) notFound();
  const { sogg } = await soggetto(user, u);
  const [stato, extra, note] = await Promise.all([statoUtente(sogg.id), extraPerGiorno(), noteUtente(sogg.id)]);
  const admin = can(user, "training.admin");
  const oggi = giornoDiOggi(piano, oggiRoma());
  const q = sogg.seStesso ? "" : `?u=${sogg.id}`;
  const modulo = piano.moduli.find((m) => m.id === g.modulo);

  const card: CardAttivita[] = attivitaGiorno(g, extra.get(day) ?? []).map((a) => ({
    id: a.id, tipo: a.tipo, chi: a.chi, durata: a.durata, testo: a.testo, extra: !!a.extra,
    links: (a.ancore ?? []).map(linkVademecum),
    valida: piano.moduli.find((m) => m.valida === a.id)?.titolo ?? null,
    done: !!stato.get(a.id)?.done, validated: !!stato.get(a.id)?.validated,
  }));
  const opzioniSezioni = [...indiceVademecum().indice.entries()].flatMap(([slug, anc]) => [slug, ...[...anc].map((x) => `${slug}#${x}`)]);

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Giorni">
        <Link href={`/training${q}`} className="text-info underline-offset-2 hover:underline">← Percorso</Link>
        <div className="flex gap-2">
          {day > 1 && <Link href={`/training/${day - 1}${q}`} className="btn-secondary" aria-label="Giorno precedente">‹ {day - 1}</Link>}
          {day !== oggi.day && <Link href={`/training/${oggi.day}${q}`} className="btn-secondary">Torna a oggi</Link>}
          {day < piano.giorni.length && <Link href={`/training/${day + 1}${q}`} className="btn-secondary" aria-label="Giorno successivo">{day + 1} ›</Link>}
        </div>
      </nav>

      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-info">Giorno {g.day} di {piano.giorni.length} · {dataLunga(g.date)}{!sogg.seStesso && ` · ${sogg.nome}`}</p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight md:text-[30px]">{g.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">Modulo: {modulo?.titolo ?? g.modulo}</p>
        <div className="mt-4 rounded-card border-l-4 border-info bg-info-soft px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">Obiettivo</p>
          <p className="mt-1 text-[15px] font-medium">{g.obiettivo}</p>
        </div>
        {g.sezioni.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {g.sezioni.map((s) => { const l = linkVademecum(s); return <Link key={s} href={l.href} className="rounded-full border border-line bg-surface-raised px-3 py-1.5 text-sm hover:border-info">📖 {l.label}</Link>; })}
          </div>
        )}
      </header>

      <GiornoClient
        day={day} attivita={card} seStesso={sogg.seStesso} admin={admin} soggettoId={sogg.id}
        sera={{ id: idSera(day), leggi: g.sera.leggi.map(linkVademecum), nota: g.sera.nota, done: !!stato.get(idSera(day))?.done }}
        nota={note.get(day)?.text ?? ""} notaAgg={note.get(day)?.updatedAt ?? null} opzioniSezioni={opzioniSezioni}
        prima={oggi.stato === "prima" && day === 1 ? dataLunga(g.date) : null}
      />
    </div>
  );
}
