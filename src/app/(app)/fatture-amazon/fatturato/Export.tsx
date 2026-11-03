"use client";

import type { Griglia } from "@/domain/fatture/fatturato";
import { excelGriglia } from "@/lib/fatture/excelFatturato";
import { scarica } from "@/lib/presenze/excelUtil";

export function Export({ titolo, etichetta, g, nome }: { titolo: string; etichetta: string; g: Griglia; nome: string }) {
  return <button type="button" className="btn-secondary h-10" onClick={() => scarica(excelGriglia(titolo, etichetta, g, "fatturato"), nome)}>Scarica Excel</button>;
}
