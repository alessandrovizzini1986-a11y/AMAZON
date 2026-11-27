import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { oggiRoma, righe } from "@/lib/compliance/dati";
import { ComplianceClient } from "./ComplianceClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compliance Tool — FleetDSP" };

/** Registro del Compliance Tool: cosa va caricato sul portale, da chi, entro quando, e chi ha già caricato cosa. Il sito non si collega al portale. */
export default async function CompliancePage() {
  const user = await requireUser();
  if (!can(user, "compliance.view")) redirect("/");
  const admin = can(user, "compliance.manage");
  const [r, template] = await Promise.all([righe(), admin ? db.complianceTemplate.findMany({ orderBy: [{ entita: "desc" }, { area: "desc" }, { ordine: "asc" }] }) : Promise.resolve([])]);
  const [nome, ...resto] = user.name.split(" ");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Amazon" title="Compliance Tool" subtitle="Quali documenti vanno caricati sul portale Compliance Tool di Amazon, chi li fornisce, entro quando, e chi ha già caricato cosa. È un registro: qui si segna, i file si caricano sul portale." />
      <ComplianceClient righe={r} oggi={oggiRoma()} admin={admin} io={{ id: user.id, nome, cognome: resto.join(" ") }}
        template={template.map((t) => ({ id: t.id, entita: t.entita, area: t.area, folder: t.folder, documento: t.documento, formato: t.formato, nomeFileStandard: t.nomeFileStandard, regolaScadenza: t.regolaScadenza, mesiAttivi: t.mesiAttivi, owner: t.owner, ownerEmail: t.ownerEmail, usato: t.usato }))} />
    </div>
  );
}
