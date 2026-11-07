import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ArchivioClient } from "./ArchivioClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Archivio file — FleetDSP" };

export default async function ArchivioPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Home" title="Archivio file di questo PC"
        subtitle="Tutti i file che hai trascinato nelle pagine restano qui, nel browser di questo PC: non vanno ritrascinati dopo un aggiornamento della pagina e si riprendono da ogni sezione con il pulsante “Dall'archivio di questo PC”. Al sito non arriva nessun file." />
      <ArchivioClient />
    </div>
  );
}
