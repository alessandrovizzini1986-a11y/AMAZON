/**
 * Audit telefono/tablet di tutte le pagine (Playwright).
 * Uso: node scripts/audit-mobile.cjs <base-url> <email> <password> [cartella-schermate]
 * Per ogni pagina: overflow orizzontale (deve essere 0) e bersagli toccabili sotto i 44 px
 * fuori dalle tabelle dati (devono essere 0). Esce con codice 1 se qualcosa non va.
 */
const { chromium, devices } = require("playwright-core");
const fs = require("fs");
const PAGINE = ["/home", "/dashboard", "/vehicles", "/vehicles/listini", "/vehicles/new", "/officine", "/orders", "/vademecum", "/presenze", "/presenze/settimanale", "/presenze/fine-mese", "/presenze/archivio", "/presenze/configurazione",
  "/carburante-telepass", "/carburante-telepass/anagrafiche", "/carburante-telepass/telepass", "/carburante-telepass/q8", "/fatture-amazon", "/fatture-amazon/importa", "/fatture-amazon/registro", "/fatture-amazon/allinea",
  "/fatture-amazon/fatturato", "/fatture-amazon/forecast", "/fatture-amazon/forecast/storico", "/costi", "/costi/fine-mese", "/costi/consuntivo", "/costi/parametri", "/import", "/users", "/config", "/portali", "/audit", "/account"];
const exe = ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium"].find((p) => fs.existsSync(p));
(async () => {
  const [base, email, pw, out] = process.argv.slice(2);
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  let errori = 0;
  for (const [nome, dev] of [["telefono", devices["iPhone 13"]], ["tablet", devices["iPad (gen 7)"]]]) {
    const ctx = await b.newContext({ ...dev });
    const p = await ctx.newPage();
    await p.goto(base + "/login");
    await p.fill("input[name=email]", email); await p.fill("input[name=password]", pw);
    await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.press("input[name=password]", "Enter")]);
    for (const r of PAGINE) {
      await p.goto(base + r, { waitUntil: "networkidle", timeout: 90000 });
      const m = await p.evaluate(() => {
        const vw = window.innerWidth;
        const dentroTabella = (e) => !!e.closest("table, svg, .overflow-x-auto");
        const piccoli = [...document.querySelectorAll("main a, main button, main input, main select, main summary, header a, header button, nav a, nav button")]
          .filter((e) => { const lab = (e.type === "checkbox" || e.type === "radio") && e.closest("label"); const rc = (lab || e).getBoundingClientRect(); return rc.width > 0 && rc.height > 0 && getComputedStyle(e).visibility !== "hidden" && rc.height < 43.5 && !dentroTabella(e) && !(e.closest("p, li") && e.tagName === "A"); })
          .map((e) => `${e.tagName.toLowerCase()}:${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24)}`);
        return { overflow: document.documentElement.scrollWidth - vw, piccoli: [...new Set(piccoli)] };
      });
      const ok = m.overflow <= 0 && m.piccoli.length === 0;
      if (!ok) errori++;
      console.log(`${ok ? "OK " : "NO "} ${nome.padEnd(8)} ${r.padEnd(36)} overflow=${m.overflow} piccoli=${m.piccoli.length}${m.piccoli.length ? " " + m.piccoli.slice(0, 6).join(" | ") : ""}`);
      if (out) await p.screenshot({ path: `${out}/${nome}${r.replace(/\//g, "_")}.png` });
    }
    await ctx.close();
  }
  await b.close();
  process.exit(errori ? 1 : 0);
})();
