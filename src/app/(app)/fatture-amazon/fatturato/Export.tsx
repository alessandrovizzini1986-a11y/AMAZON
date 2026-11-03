"use client";

import type { Griglia } from "@/domain/fatture/fatturato";
import { excelGriglia } from "@/lib/fatture/excelFatturato";
import { scarica } from "@/lib/presenze/excelUtil";
import { Aiuto } from "@/components/Aiuto";

export function Export({ titolo, etichetta, g, nome }: { titolo: string; etichetta: string; g: Griglia; nome: string }) {
  return <span className="inline-flex items-center gap-1"><button type="button" className="btn-secondary h-10" onClick={() => scarica(excelGriglia(titolo, etichetta, g, "fatturato"), nome)}>Scarica Excel</button><Aiuto k="fatturato.excel" /></span>;
}
