import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PORTALE_GLS, URL_GLS, sedeDaNota } from "./accesso";
import { SpedizioniClient } from "./SpedizioniClient";
import { storicoBollettini } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Spedizioni GLS — FleetDSP" };

export default async function SpedizioniGlsPage() {
  const user = await requireUser();
  if (!can(user, "spedizioni.view")) redirect("/");
  const [p, storico] = await Promise.all([db.portaleCredenziale.findUnique({ where: { portale: PORTALE_GLS } }), storicoBollettini().catch(() => [])]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Strumenti" title="Spedizioni GLS"
        subtitle="Quando spediamo con GLS: da qui entri nel portale con il nostro accesso e compili il bollettino di spedizione, che diventa un PDF da stampare, salvare o inviare. Ogni bollettino fatto resta nello storico qui sotto." />
      {/* la password non arriva mai alla pagina: si legge solo quando premi Copia o Mostra */}
      <SpedizioniClient accesso={{ url: p?.url || URL_GLS, username: p?.username ?? "", sede: sedeDaNota(p?.note ?? null), haPassword: !!p?.passwordCifrata }} storico={storico} />
    </div>
  );
}
