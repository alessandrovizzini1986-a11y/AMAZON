import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { tutteLeVoci } from "@/components/navModel";
import { giornoRoma, piuGiorni } from "@/domain/telematica";

export const dynamic = "force-dynamic";

const PERIODI = [7, 30, 60, 90];
const it = (g: string) => `${g.slice(8)}/${g.slice(5, 7)}`;
const minuti = (sec: number) => (sec < 60 ? (sec ? "< 1" : "0") : Math.round(sec / 60).toLocaleString("it-IT"));

export default async function UsoPage({ searchParams }: { searchParams: Promise<{ giorni?: string; chi?: string }> }) {
  await requireSuperAdmin();
  const q = await searchParams;
  const giorni = PERIODI.includes(Number(q.giorni)) ? Number(q.giorni) : 30;
  const oggi = giornoRoma(new Date()), dal = piuGiorni(oggi, -(giorni - 1));
  const [righe, utenti, primo, azioni] = await Promise.all([
    db.usoPagina.findMany({ where: { giorno: { gte: dal }, ...(q.chi ? { userId: q.chi } : {}) } }),
    db.user.findMany({ where: { role: { not: "DRIVER" } }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" } }),
    db.usoPagina.findFirst({ orderBy: { giorno: "asc" }, select: { giorno: true } }),
    db.auditLog.groupBy({ by: ["action"], where: { createdAt: { gte: new Date(`${dal}T00:00:00Z`) }, ...(q.chi ? { userId: q.chi } : {}) }, _count: { _all: true }, orderBy: { _count: { action: "desc" } }, take: 40 }),
  ]);
  const nome = new Map(utenti.map((u) => [u.id, u.firstName]));
  type Somma = { visite: number; secondi: number; giorni: Set<string>; persone: Set<string>; ultima: string };
  const per = new Map<string, Somma>();
  for (const r of righe) {
    const s = per.get(r.voce) ?? { visite: 0, secondi: 0, giorni: new Set<string>(), persone: new Set<string>(), ultima: "" };
    s.visite += r.visite; s.secondi += r.secondi; if (r.visite) { s.giorni.add(r.giorno); s.persone.add(r.userId); if (r.giorno > s.ultima) s.ultima = r.giorno; }
    per.set(r.voce, s);
  }
  const menu = tutteLeVoci().map((v) => ({ ...v, s: per.get(v.href) }));
  const altre = [...per.entries()].filter(([k]) => k.startsWith("altro:")).map(([k, s]) => ({ href: k.slice(6), label: k.slice(6), gruppo: "Fuori menu", s }));
  const tutte = [...menu, ...altre].sort((a, b) => (b.s?.giorni.size ?? 0) - (a.s?.giorni.size ?? 0) || (b.s?.visite ?? 0) - (a.s?.visite ?? 0) || a.gruppo.localeCompare(b.gruppo));
  const maiAperte = menu.filter((v) => !v.s?.visite).length;
  // se la statistica è partita da meno del periodo scelto, il giudizio si misura sui giorni che esistono davvero
  const giorniVeri = primo && primo.giorno > dal ? Math.round((Date.parse(oggi) - Date.parse(primo.giorno)) / 864e5) + 1 : giorni;
  // giudizio semplice sul periodo: usata almeno un giorno a settimana = sì; meno = poco; mai = mai
  const giudizio_ = (s?: Somma) => { const g = s?.giorni.size ?? 0; return !s?.visite ? { t: "Mai aperta", c: "text-red-700" } : g >= Math.max(1, Math.round(giorniVeri / 7)) ? { t: "Usata", c: "text-emerald-700" } : { t: "Poco usata", c: "text-amber-700" }; };
  const link = (g: number, chi?: string) => `/uso?giorni=${g}${chi ? `&chi=${chi}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Gestione" title="Uso del sito" subtitle="Quali pagine vengono aperte, da quante persone, per quanti giorni e per quanto tempo. Serve a decidere cosa tenere, cosa ridurre e cosa togliere. La vedi solo tu." />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {PERIODI.map((g) => <Link key={g} href={link(g, q.chi)} className={g === giorni ? "btn-primary" : "btn-secondary"}>Ultimi {g} giorni</Link>)}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <Link href={link(giorni)} className={!q.chi ? "btn-primary" : "btn-secondary"}>Tutti</Link>
        {utenti.map((u) => <Link key={u.id} href={link(giorni, u.id)} className={q.chi === u.id ? "btn-primary" : "btn-secondary"}>{u.firstName} {u.lastName.slice(0, 1)}.</Link>)}
      </div>
      <p className="text-sm text-slate-600">
        {primo ? <>La statistica parte dal {it(primo.giorno)}/{primo.giorno.slice(0, 4)}: prima di quella data non c&apos;è niente. </> : <>Non c&apos;è ancora nessuna visita registrata: la statistica parte da adesso. </>}
        Nel periodo: {menu.length - maiAperte} voci di menu aperte almeno una volta, <b>{maiAperte} mai aperte</b>.
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500">
            <th className="px-3 py-2">Voce</th><th className="px-2 py-2">Menu</th><th className="px-2 py-2 text-right">Giorni d&apos;uso</th><th className="px-2 py-2 text-right">Visite</th><th className="px-2 py-2 text-right">Minuti</th><th className="px-2 py-2">Chi</th><th className="px-2 py-2">Ultima volta</th><th className="px-2 py-2">Giudizio</th>
          </tr></thead>
          <tbody>
            {tutte.map((v) => { const g = giudizio_(v.s); return (
              <tr key={v.gruppo + v.href} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-medium">{v.label}</td>
                <td className="px-2 py-1.5 text-slate-600">{v.gruppo}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{v.s?.giorni.size ?? 0}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{v.s?.visite ?? 0}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{minuti(v.s?.secondi ?? 0)}</td>
                <td className="px-2 py-1.5 text-slate-600">{v.s ? [...v.s.persone].map((id) => nome.get(id) ?? "?").sort().join(", ") || "—" : "—"}</td>
                <td className="px-2 py-1.5 tabular-nums text-slate-600">{v.s?.ultima ? it(v.s.ultima) : "—"}</td>
                <td className={`px-2 py-1.5 ${g.c}`}>{g.t}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Giorni d&apos;uso = in quanti giorni diversi la pagina è stata aperta. «Usata» = almeno un giorno a settimana nel periodo. I minuti contano solo il tempo con la pagina in vista, al massimo 30 per volta.</p>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-base font-semibold">Operazioni fatte nel periodo</h2>
        <p className="text-sm text-slate-600">Aprire una pagina non vuol dire usarla: qui c&apos;è quante volte è stata fatta davvero un&apos;operazione (un caricamento, un salvataggio, un controllo), dal registro attività.</p>
        {azioni.length === 0 ? <p className="text-sm text-slate-500">Nessuna operazione registrata nel periodo.</p> : (
          <div className="grid gap-x-8 gap-y-0.5 text-sm sm:grid-cols-2 lg:grid-cols-3">{azioni.map((a) => <div key={a.action} className="flex justify-between gap-3 border-b border-slate-100 py-0.5"><span className="truncate">{a.action}</span><span className="tabular-nums text-slate-600">{a._count._all}</span></div>)}</div>
        )}
      </section>
    </div>
  );
}
