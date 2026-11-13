import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { NavIcon } from "@/components/icons";
import { menuPer } from "@/components/navModel";
import { percorsiCosti, percorsoFattureSettimana, percorsoPresenzeOra, percorsoTelepassOra } from "@/lib/percorsi";
import { daFare, type Percorso } from "@/domain/percorsi/percorso";
import { allerteTariffe, etaMesi, versioniCDL, versioniMog } from "../costi/dati";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — FleetDSP" };

const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const it = (s: string) => s.split("-").reverse().join("/");

/** Home: cosa c'è da fare questa settimana e questo mese (dai percorsi dei moduli), gli avvisi e tutte le sezioni. */
export default async function HomePage() {
  const user = await requireUser();
  if (!can(user, "home.view")) redirect("/");
  const [costi, fatture, presenze, telepass] = await Promise.all([
    can(user, "costi.run") ? percorsiCosti() : Promise.resolve([] as Percorso[]),
    can(user, "fatture.import") ? percorsoFattureSettimana() : Promise.resolve(null),
    can(user, "presenze.run") ? percorsoPresenzeOra() : Promise.resolve(null),
    can(user, "telepass.run") ? percorsoTelepassOra() : Promise.resolve(null),
  ]);
  const lista = daFare([fatture, presenze, telepass, ...costi].filter((p): p is Percorso => !!p));
  const aperti = lista.filter((x) => !x.completo), chiusi = lista.filter((x) => x.completo);

  const avvisi: { testo: React.ReactNode; href: string; grave?: boolean }[] = [];
  if (can(user, "costi.view")) {
    const [tar, cdl, mog] = await Promise.all([allerteTariffe(), versioniCDL(), versioniMog()]);
    for (const a of tar) avvisi.push({ testo: <>Cambio tariffa {a.voce === "TRASFERTA" ? "trasferta" : a.voce === "TRASFERTA_GLS" ? "trasferta GLS" : "extra domenica"} tra <b>{a.giorni} giorni</b>: dal {it(a.validaDal!)} {eur(a.precedente ?? 0)} → {eur(a.valore!)} €/giorno</>, href: "/costi/parametri#tariffe", grave: a.allerta === 7 });
    if (!cdl[0]) avvisi.push({ testo: "Nessuna anagrafica CDL caricata: la stima SIC non si può fare", href: "/costi/parametri#anagrafica", grave: true });
    else if (etaMesi(cdl[0].mese) > 3) avvisi.push({ testo: <>L&apos;anagrafica CDL più recente è del {it(cdl[0].mese)}: ha più di 3 mesi, chiedi a HR quella aggiornata</>, href: "/costi/parametri#anagrafica" });
    if (mog[0] && (Date.now() - Date.parse(mog[0].versione)) / 864e5 > 40) avvisi.push({ testo: <>Il file MOG di Adecco è del {it(mog[0].versione)}: ha più di 40 giorni, chiedi a Erika quello aggiornato</>, href: "/costi/parametri#mog" });
  }
  const gruppi = menuPer(user.role).filter((g) => g.id !== "home");
  const nome = user.name.split(" ")[0];
  const oggi = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={oggi.charAt(0).toUpperCase() + oggi.slice(1)} title={`Ciao ${nome}, ecco cosa c'è da fare`}
        subtitle="Le scadenze della settimana e del mese si aggiornano da sole con quello che carichi nel sito. Premi Vai per andare dritto al passo da fare." />

      <section aria-labelledby="dafare" data-tour="dafare">
        <h2 id="dafare" className="mb-3 text-[19px] font-semibold">Da fare {aperti.length > 0 && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 align-middle text-xs font-semibold text-white">{aperti.length}</span>}</h2>
        {aperti.length === 0 ? (
          <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">✓ Tutto fatto per questa settimana e questo mese.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {aperti.map((x) => (
              <article key={x.id} className="card flex flex-col gap-2 p-4 md:p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{x.titolo}</h3>
                  <span className="shrink-0 text-xs text-ink-muted">{x.fatti} di {x.obbligatori} passi</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden><div className="h-full rounded-full bg-brand" style={{ width: `${(x.fatti / Math.max(1, x.obbligatori)) * 100}%` }} /></div>
                {x.prossimo && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span><span className="text-ink-muted">Ora: </span>{x.prossimo.titolo}{x.prossimo.nota && <span className="text-ink-muted"> ({x.prossimo.nota})</span>}</span>
                    {x.prossimo.href && <Link href={x.prossimo.href} className="btn-primary px-3 py-1.5 text-sm">Vai</Link>}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {chiusi.length > 0 && <p className="mt-3 text-sm text-ok">✓ Già fatto: {chiusi.map((x) => x.titolo).join(" · ")}</p>}
      </section>

      {avvisi.length > 0 && (
        <section aria-labelledby="avvisi" data-tour="avvisi">
          <h2 id="avvisi" className="mb-3 text-[19px] font-semibold">Avvisi</h2>
          <ul className="flex flex-col gap-2">
            {avvisi.map((a, i) => (
              <li key={i} className={`flex flex-wrap items-center justify-between gap-2 rounded-control px-4 py-3 text-sm ${a.grave ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                <span>{a.testo}</span><Link href={a.href} className="font-semibold underline">Apri</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sezioni">
        <h2 id="sezioni" className="mb-3 text-[19px] font-semibold">Tutte le sezioni</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {gruppi.map((g) => (
            <div key={g.id} data-tour={`gruppo-${g.id}`} className="card p-4 md:p-5">
              <h3 className="mb-2 flex items-center gap-2 font-semibold"><NavIcon name={g.icon} className="h-4 w-4 text-brand" />{g.label}</h3>
              <ul className="flex flex-col">
                {g.items.map((v) => (
                  <li key={v.href}><Link href={v.href} className="flex min-h-[44px] flex-col justify-center rounded-control px-2 py-1.5 hover:bg-surface [@media(pointer:coarse)]:!flex [@media(pointer:coarse)]:!items-stretch">
                    <span className="font-medium text-brand">{v.label}</span>{v.descr && <span className="text-xs text-ink-muted">{v.descr}</span>}
                  </Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
