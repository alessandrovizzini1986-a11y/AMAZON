import { describe, expect, it } from "vitest";
import { eSegnalibro, leggiPagina } from "@/domain/segnalibri/leggi";

const PAGINA = `<!doctype html><html><head><title>Kit di prova</title><style>a{color:red}</style></head><body>
<h1>Kit di prova</h1>
<p>Trascina questo pulsante: <a class="b" href="javascript:void%20(()%20%3D%3E%20%7Balert('ciao%20%26%20basta')%7D)()">Compila <b>modulo</b></a></p>
<ol><li>Entra nel portale.</li><li>Clicca il segnalibro &egrave; fatto.</li></ol>
<p>Se non funziona incolla: <code>javascript:void%20(()%20%3D%3E%20%7B%7D)()</code></p>
<a href='javascript:alert(&quot;due&quot;)'>Secondo</a> <a href="https://esempio.it">un link normale</a>
<a href="javascript:void%20(()%20%3D%3E%20%7Balert('ciao%20%26%20basta')%7D)()">doppione</a>
<script>document.title = "x";</script></body></html>`;

describe("lettura di una pagina di segnalibri", () => {
  const r = leggiPagina(PAGINA);
  it("prende titolo e pulsanti, senza doppioni e senza i link normali", () => {
    expect(r.titolo).toBe("Kit di prova");
    expect(r.pulsanti.map((p) => p.nome)).toEqual(["Compila modulo", "Secondo"]);
    expect(r.pulsanti[0].codice).toBe("javascript:void%20(()%20%3D%3E%20%7Balert('ciao%20%26%20basta')%7D)()");
    expect(r.pulsanti[1].codice).toBe('javascript:alert("due")');
    expect(r.pulsanti.every((p) => eSegnalibro(p.codice))).toBe(true);
  });
  it("le istruzioni sono testo semplice, senza codice e senza script", () => {
    expect(r.istruzioni).toContain("• Entra nel portale.");
    expect(r.istruzioni).toContain("• Clicca il segnalibro è fatto.");
    expect(r.istruzioni).not.toMatch(/javascript:|document\.title|color:red|</);
  });
  it("una pagina senza segnalibri non ne inventa", () => {
    expect(leggiPagina("<html><body><a href='https://x.it'>x</a></body></html>").pulsanti).toEqual([]);
    expect(eSegnalibro("https://x.it")).toBe(false);
  });
});
