import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { renderMarkdown } from "@/lib/vademecum";
import { corso } from "@/content/corsi";
import { chiaveLezione, statoLezioni, vista } from "@/domain/corsi/corsi";
import { VademecumContent } from "../../../vademecum/VademecumContent";
import { progresso } from "../../dati";
import { Esercizi } from "./Esercizi";

export const dynamic = "force-dynamic";

export default async function LezionePage({ params, searchParams }: { params: Promise<{ corso: string; lezione: string }>; searchParams: Promise<{ ripasso?: string; v?: string }> }) {
  const user = await requireUser();
  const { corso: id, lezione: slug } = await params;
  const q = await searchParams;
  const c = corso(id), i = c?.lezioni.findIndex((l) => l.slug === slug) ?? -1;
  if (!c || i < 0) notFound();
  const l = c.lezioni[i];
  const mio = await progresso(user.id);
  const superate = new Set(c.lezioni.filter((x) => mio.get(chiaveLezione(c.id, x.slug))?.superataIl).map((x) => x.slug));
  const stato = statoLezioni(c, superate)[i];
  const ripasso = stato === "chiusa" && q.ripasso === "1" && can(user, "training.admin");
  if (stato === "chiusa" && !ripasso) redirect("/corsi");
  // lezione da superare: la variante degli esercizi segue i tentativi salvati; ripasso: quella chiesta dalla pagina
  const tentativi = mio.get(chiaveLezione(c.id, l.slug))?.tentativi ?? 0;
  const variante = stato === "aperta" ? tentativi : Math.max(0, Number(q.v) || 0);
  const dopo = c.lezioni[i + 1], prima = c.lezioni[i - 1];

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader eyebrow={`${c.titolo} · lezione ${i + 1} di ${c.lezioni.length}`} title={l.titolo} subtitle={`${l.obiettivo} Circa ${l.minuti} minuti.`} />
      {ripasso && <p className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">Stai guardando questa lezione in ripasso, come tutor: gli esercizi si correggono ma non contano come lezione superata.</p>}
      {stato === "superata" && <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">Lezione già superata: puoi rileggerla e rifare gli esercizi quando vuoi, l&apos;avanzamento non cambia.</p>}
      <div className="card p-4 md:p-6"><VademecumContent html={renderMarkdown(l.testo)} /></div>
      {l.approfondisci && (
        <p className="text-sm text-ink-muted">Per approfondire: {l.approfondisci.map((a, k) => <span key={a.href}>{k > 0 && " · "}<Link className="underline" href={a.href}>{a.label}</Link></span>)}</p>
      )}
      <Esercizi key={variante} corso={c.id} slug={l.slug} esercizi={l.esercizi.map((g) => vista(g, variante))} variante={variante} conta={stato === "aperta"}
        dopo={dopo ? { href: `/corsi/${c.id}/${dopo.slug}`, titolo: dopo.titolo } : null} tentativi={tentativi} />
      <nav className="flex flex-wrap justify-between gap-3 border-t border-line pt-4 text-sm" aria-label="Lezioni vicine">
        {prima ? <Link className="btn-secondary" href={`/corsi/${c.id}/${prima.slug}`}>← {prima.titolo}</Link> : <span />}
        <Link className="btn-secondary" href="/corsi">Tutte le lezioni</Link>
      </nav>
    </article>
  );
}
