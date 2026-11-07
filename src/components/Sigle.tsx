import Link from "next/link";
import { pezziConSigle } from "@/content/glossario";

/**
 * Testo con le sigle spiegate: la prima volta che compare una sigla del glossario è sottolineata a puntini,
 * il passaggio del mouse (o il tocco lungo) mostra il significato e il clic apre il Glossario.
 */
export function ConSigle({ testo }: { testo: string }) {
  return (
    <>
      {pezziConSigle(testo).map((p, i) =>
        typeof p === "string" ? p : (
          <Link key={i} href={`/vademecum/18-glossario#${p.tema.toLowerCase().replace(/ /g, "-")}`} className="text-inherit no-underline">
            <abbr title={`${p.nome}: ${p.spiega}`} className="cursor-help underline decoration-dotted underline-offset-2">{p.sigla}</abbr>
          </Link>
        ),
      )}
    </>
  );
}
