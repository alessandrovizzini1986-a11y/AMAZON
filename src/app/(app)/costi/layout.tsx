import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, type Action } from "@/lib/rbac";
import { Tabs, type Scheda } from "../fatture-amazon/Tabs";
import { allerteTariffe, etaMesi, versioniCDL, versioniMog } from "./dati";
import { percorsiCosti } from "@/lib/percorsi";
import { Percorso } from "@/components/Percorso";
import { PrimaVolta } from "@/components/PrimaVolta";

const SCHEDE: (Scheda & { perm: Action })[] = [
  { href: "/costi", label: "Mesi", exact: true, perm: "costi.view" },
  { href: "/costi/fine-mese", label: "Fine mese", perm: "costi.view" },
  { href: "/costi/consuntivo", label: "Consuntivo", perm: "costi.view" },
  { href: "/costi/parametri", label: "Parametri e anagrafica", perm: "costi.view" },
];

const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const it = (s: string) => s.split("-").reverse().join("/");

export default async function CostiLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!can(user, "costi.view")) redirect("/");
  const [allerte, versioni, mog, percorsi] = await Promise.all([allerteTariffe(), versioniCDL(), versioniMog(), can(user, "costi.run") ? percorsiCosti() : Promise.resolve([])]);
  const ultima = versioni[0];
  const vecchia = ultima && etaMesi(ultima.mese) > 3;
  return (
    <div>
      <Tabs etichetta="Sezioni Costi del personale" schede={SCHEDE.filter((s) => can(user, s.perm)).map(({ perm: _p, ...s }) => s)} />
      <PrimaVolta id="costi" titolo="Costi del personale" passi={["A fine mese controlla in Parametri che l'anagrafica CDL e le tariffe siano aggiornate.", "In Fine mese premi Calcola costi, leggi i controlli rossi e salva le stime STD e SIC.", "Quando arrivano ADIT e paga, caricali in Consuntivo e leggi i delta."]} />
      {percorsi.map((p) => <Percorso key={p.id} p={p} />)}
      {allerte.map((a) => (
        <p key={a.voce} role="alert" className={`mb-4 rounded-control px-4 py-3 text-sm ${a.allerta === 7 ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
          <b>Cambio tariffa {a.voce === "TRASFERTA" ? "trasferta" : "extra domenica"} tra {a.giorni} giorni</b>: dal {it(a.validaDal!)} {eur(a.precedente ?? 0)} → {eur(a.valore!)} €/giorno. Il calcolo usa già la tariffa alla data di ogni giorno. <Link className="underline" href="/costi/parametri#tariffe">Tariffe</Link>
        </p>
      ))}
      {mog[0] && (Date.now() - Date.parse(mog[0].versione)) / 864e5 > 40 && <p role="alert" className="mb-4 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">Il file MOG di Adecco è del {mog[0].versione.split("-").reverse().join("/")}: ha più di 40 giorni. Chiedi a Erika il file aggiornato. <Link className="underline" href="/costi/parametri#mog">File MOG</Link></p>}
      {!ultima && <p role="alert" className="mb-4 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">Nessuna anagrafica CDL caricata: la stima SIC non si può fare. <Link className="underline" href="/costi/parametri#anagrafica">Caricala</Link></p>}
      {vecchia && <p role="alert" className="mb-4 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">L&apos;anagrafica CDL più recente è del {ultima.mese.split("-").reverse().join("/")}: ha più di 3 mesi. Chiedi a HR quella aggiornata. <Link className="underline" href="/costi/parametri#anagrafica">Anagrafica</Link></p>}
      {children}
    </div>
  );
}
