import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import type { Situazione } from "@/domain/telefoni/censimento";
import { TelefoniClient, type SimVista, type TelVista } from "./TelefoniClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Telefoni e SIM — FleetDSP" };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function TelefoniPage() {
  const user = await requireUser();
  if (!can(user, "telefoni.view")) redirect("/");
  const [sim, tel, man] = await Promise.all([
    db.sim.findMany({ orderBy: [{ inWind: "desc" }, { station: "asc" }, { numero: "asc" }] }),
    db.telefono.findMany({ orderBy: [{ inWind: "desc" }, { station: "asc" }, { imei: "asc" }] }),
    db.situazioneManuale.findMany({ select: { tipo: true, chiave: true, situazione: true } }),
  ]);
  const manuale = new Map(man.map((m) => [`${m.tipo}:${m.chiave}`, m.situazione as Situazione]));
  // PIN e PUK non escono mai dalla pagina: si leggono uno alla volta con "Mostra" (ADMIN, audit)
  const simV: SimVista[] = sim.map(({ pin, puk, id: _id, aggiornatoIl: _a, attivazione, fonti, ...x }) => ({ ...x, attivazione: iso(attivazione), haPin: !!pin, haPuk: !!puk, fonti: fonti ?? "", manuale: manuale.get(`SIM:${x.numero}`) ?? null }));
  const telV: TelVista[] = tel.map(({ id: _id, aggiornatoIl: _a, attivazione, fonti, ...x }) => ({ ...x, attivazione: iso(attivazione), fonti: fonti ?? "", manuale: manuale.get(`TEL:${x.imei}`) ?? null }));
  const ultimo = [...sim, ...tel].reduce<Date | null>((m, x) => (!m || x.aggiornatoIl > m ? x.aggiornatoIl : m), null);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Personale · dotazioni" title="Telefoni e SIM"
        subtitle="Il file Wind ufficiale dice cosa paghiamo (SIM e telefoni a canone); i file delle station dicono dove sono, a chi sono assegnati, in che stato, e PIN/PUK. Qui li vedi abbinati: in giallo quello che paghiamo ma non risulta da nessuna parte." />
      <TelefoniClient sim={simV} telefoni={telV} aggiornatoIl={ultimo?.toISOString() ?? null} puoCaricare={can(user, "telefoni.manage")} puoCodici={can(user, "telefoni.codici")} />
    </div>
  );
}
