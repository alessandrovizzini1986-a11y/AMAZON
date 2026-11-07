import { requireUser } from "@/lib/auth";
import { meseScelto } from "@/lib/meseServer";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ArchivioClient, type Registrato } from "./ArchivioClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Archivio presenze — FleetDSP" };

function meseDefault(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ArchivioPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const mese = await meseScelto(params.mese, meseDefault());
  const [anno, m] = mese.split("-").map(Number);
  let registrati: Registrato[] = [];
  let tableMissing = false;
  try {
    registrati = (await db.presenzeFile.findMany({ where: { anno, mese: m }, orderBy: { caricatoIl: "desc" } })).map((f) => ({
      tipo: f.tipo, station: f.station, giorno: f.giorno, nomeFile: f.nomeFile, caricatoDa: f.caricatoDa, caricatoIl: f.caricatoIl.toISOString(),
    }));
  } catch {
    tableMissing = true;
  }
  return (
    <div>
      <PageHeader
        eyebrow="Personale · Presenze · passo 1"
        title="Archivio file"
        subtitle="Trascina qui CSV Amazon, tracking SIC/STD e export Zucchetti, anche tutti insieme. I file restano su questo PC: al sito arrivano solo nome, tipo, station e giorni."
      />
      {tableMissing && (
        <p className="mb-4 rounded-control bg-warn-soft px-3 py-2 text-sm text-warn">Registro file non ancora attivo su questo database: i file restano comunque disponibili su questo PC.</p>
      )}
      <ArchivioClient mese={mese} registrati={registrati} canRun={can(user, "presenze.run")} />
    </div>
  );
}
