import "server-only";
import { db } from "@/lib/db";
import { versioneFile, type FileVersione } from "@/domain/forecast/storico";

/** Versione (domenica della settimana di emissione) di ogni file di forecast, dal nome e dalla prima data. */
export async function versioniForecast(): Promise<(FileVersione & { nome: string })[]> {
  const [files, min] = await Promise.all([
    db.forecastFile.findMany({ select: { id: true, nome: true, linea: true, caricatoIl: true } }),
    db.forecastRoute.groupBy({ by: ["fileId"], _min: { data: true } }),
  ]);
  const m = new Map(min.map((x) => [x.fileId, x._min.data?.toISOString().slice(0, 10)]));
  return files.map((f) => ({ id: f.id, nome: f.nome, linea: f.linea, caricatoIl: f.caricatoIl.toISOString(), versione: versioneFile(f.nome, m.get(f.id) ?? f.caricatoIl.toISOString().slice(0, 10)) }));
}
