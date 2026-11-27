import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PortaliClient } from "./PortaliClient";
import { riservato } from "@/lib/telematica/riservato";

export const dynamic = "force-dynamic";

export default async function PortaliPage() {
  const io = await requireRole("ADMIN");
  // gli accessi a Targa e FlottaWeb comandano i mezzi: li vede solo il super admin
  const portali = (await db.portaleCredenziale.findMany({ orderBy: { portale: "asc" } })).filter((p) => io.superAdmin || !riservato(p.portale));
  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <PageHeader eyebrow="Gestione" title="Portali e credenziali" subtitle="Accessi ai portali dei noleggiatori, Telepass e simili. Le password sono cifrate: per vederle riscrivi la tua password di ADMIN. Ogni visualizzazione resta nel log di audit." />
      <PortaliClient portali={portali.map((p) => ({ id: p.id, portale: p.portale, url: p.url, username: p.username, haPassword: !!p.passwordCifrata, note: p.note, aggiornatoIl: p.aggiornatoIl.toISOString(), aggiornatoDa: p.aggiornatoDa }))} />
    </div>
  );
}
