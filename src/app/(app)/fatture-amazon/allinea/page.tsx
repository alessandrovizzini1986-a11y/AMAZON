import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { utenteCon } from "../dati";
import { AllineaClient } from "./AllineaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Allinea con AGGREGATO — FleetDSP" };

export default async function AllineaPage() {
  const user = await utenteCon("fatture.allinea");
  return (
    <div>
      <PageHeader eyebrow="Amazon · solo admin" title="Allinea con il file AGGREGATO"
        subtitle="Il sito non scrive mai nel file AGGREGATO: lo legge per sapere quali fatture sono già in fatt_2026 e, quando serve, per caricare lo storico delle righe." />
      <AllineaClient canStorico={can(user, "fatture.storico")} />
    </div>
  );
}
