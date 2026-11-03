import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, type Action } from "@/lib/rbac";
import { Tabs, type Scheda } from "../fatture-amazon/Tabs";
import { allerteTariffe, etaMesi, versioniCDL } from "./dati";

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
  const [allerte, versioni] = await Promise.all([allerteTariffe(), versioniCDL()]);
  const ultima = versioni[0];
  const vecchia = ultima && etaMesi(ultima.mese) > 3;
  return (
    <div>
      <Tabs etichetta="Sezioni Costi del personale" schede={SCHEDE.filter((s) => can(user, s.perm)).map(({ perm: _p, ...s }) => s)} />
      {allerte.map((a) => (
        <p key={a.voce} role="alert" className={`mb-4 rounded-control px-4 py-3 text-sm ${a.allerta === 7 ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
          <b>Cambio tariffa {a.voce === "TRASFERTA" ? "trasferta" : "extra domenica"} tra {a.giorni} giorni</b>: dal {it(a.validaDal!)} {eur(a.precedente ?? 0)} → {eur(a.valore!)} €/giorno. Il calcolo usa già la tariffa alla data di ogni giorno. <Link className="underline" href="/costi/parametri#tariffe">Tariffe</Link>
        </p>
      ))}
      {!ultima && <p role="alert" className="mb-4 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">Nessuna anagrafica CDL caricata: la stima SIC non si può fare. <Link className="underline" href="/costi/parametri#anagrafica">Caricala</Link></p>}
      {vecchia && <p role="alert" className="mb-4 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">L&apos;anagrafica CDL più recente è del {ultima.mese.split("-").reverse().join("/")}: ha più di 3 mesi. Chiedi a HR quella aggiornata. <Link className="underline" href="/costi/parametri#anagrafica">Anagrafica</Link></p>}
      {children}
    </div>
  );
}
