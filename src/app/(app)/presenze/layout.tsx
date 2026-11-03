import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { PresenzeTabs } from "./PresenzeTabs";
import { percorsoPresenzeOra } from "@/lib/percorsi";
import { Percorso } from "@/components/Percorso";
import { PrimaVolta } from "@/components/PrimaVolta";

export default async function PresenzeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  assertCan(user, "presenze.view");
  const percorso = can(user, "presenze.run") ? await percorsoPresenzeOra() : null;
  return (
    <div>
      <PresenzeTabs config={can(user, "presenze.config")} />
      <PrimaVolta id="presenze" titolo="Presenze" passi={["Trascina in Archivio i CSV Amazon e i tracking: restano su questo PC.", "In Settimanale esegui il controllo, salvalo e manda i messaggi agli Ops.", "A fine mese fai il controllo con Zucchetti."]} />
      {percorso && <Percorso p={percorso} />}
      {children}
    </div>
  );
}
