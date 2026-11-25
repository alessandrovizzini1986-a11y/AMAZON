/**
 * Motore Canvas 2D delle decorazioni festive della login. Tutto procedurale: niente immagini, niente librerie.
 *
 * Guardrail
 * - ~30 fps: tra due frame disegnati passano almeno FRAME_MIN_MS (meno 2 ms di tolleranza sui timestamp di rAF);
 * - devicePixelRatio al massimo 2, con setTransform a ogni ridimensionamento (niente scale cumulative, niente sfocature);
 * - resize con debounce; pausa immediata a pagina nascosta e dopo 60 s senza input, ripresa al primo input;
 * - niente shadowBlur né filter; nessuna allocazione per frame (gradienti unitari creati una volta e riusati con setTransform);
 * - non disegna sopra il modulo di login: le particelle svaniscono avvicinandosi alla "zona" (card, piè di pagina,
 *   interruttore), così testi e controlli conservano il contrasto di sempre;
 * - allo stop: rAF cancellato, listener e timer rimossi, ResizeObserver scollegato, memoria del canvas liberata.
 */
import type { Effetto } from "@/domain/festivita";
import { ascoltaMedia, osservaAttivita } from "./attivita";

export const FRAME_MIN_MS = 33;
const TOLLERANZA_MS = 2; // i timestamp di rAF oscillano di ±1 ms: senza tolleranza a 60 Hz si scenderebbe a 20 fps
export const DPR_MAX = 2;
export const RESIZE_MS = 150;
export const INATTIVITA_MS = 60_000;
export const SOGLIA_MOBILE_PX = 768;
export const TETTO = { mobile: 30, desktop: 70 } as const;
const MARGINE_ZONA = 28; // px di sfumatura attorno alla zona del modulo
const TAU = Math.PI * 2;

/** Particelle per effetto [telefono, desktop], sempre entro TETTO. */
const DENSITA: Record<Effetto, readonly [number, number]> = {
  neve: [30, 70], stelle: [26, 60], primavera: [16, 34], scintille: [27, 63],
  morbide: [20, 40], bokeh: [9, 16], foglie: [8, 14], tricolore: [8, 14], lumi: [5, 8],
};

/** Quante particelle per l'effetto a questa larghezza (CSS px): sotto i 768 px il tetto è quello del telefono. */
export function numeroParticelle(effetto: Effetto, larghezza: number): number {
  const mobile = larghezza < SOGLIA_MOBILE_PX;
  return Math.min(DENSITA[effetto][mobile ? 0 : 1], mobile ? TETTO.mobile : TETTO.desktop);
}

/**
 * Colori: solo token CSS esistenti (globals.css), schiariti verso il bianco della quota indicata
 * (0 = token puro) perché si leggano sul fondale navy. Cambiando i token cambiano anche le decorazioni.
 */
type Tinta = readonly [token: string, luce: number];
const PALETTE: Record<Effetto, readonly Tinta[]> = {
  neve: [["--color-ink-inverse", 0], ["--color-brand-light", 0]],
  stelle: [["--color-warn", 0.45], ["--color-warn-soft", 0], ["--color-ink-inverse", 0]],
  primavera: [["--color-ok", 0.55], ["--color-danger", 0.6], ["--color-warn", 0.6]],
  scintille: [["--color-warn", 0.45], ["--color-warn-soft", 0], ["--color-brand-light", 0]],
  tricolore: [["--color-ok", 0.15], ["--color-ink-inverse", 0], ["--color-danger", 0.1]],
  morbide: [["--color-warn", 0.35], ["--color-brand", 0.45]],
  bokeh: [["--color-warn", 0.4], ["--color-warn-soft", 0], ["--color-danger", 0.55]],
  foglie: [["--color-warn", 0.2], ["--color-danger", 0.3], ["--color-ok", 0.3], ["--color-ink-inverse", 0]], // l'ultimo è la venatura
  lumi: [["--color-warn-soft", 0], ["--color-ink-inverse", 0]],
};

// forme, disegnate in un quadrato unitario [-1, 1] e portate a misura con setTransform
const MORBIDO = 0, CERCHIO = 1, FIOCCO = 2, STELLA = 3, TRIANGOLO = 4, ROMBO = 5, FOGLIA = 6, QUADRATO = 7, SCINTILLA = 8;
const FORME_PRIMAVERA = [CERCHIO, TRIANGOLO, ROMBO, FOGLIA] as const;

type Particella = {
  x: number; y: number; vx: number; vy: number; r: number; a: number;
  f: number; vf: number; rot: number; vr: number; c: number; forma: number; vita: number; durata: number;
};
const nuova = (): Particella => ({ x: 0, y: 0, vx: 0, vy: 0, r: 1, a: 0, f: 0, vf: 0, rot: 0, vr: 0, c: 0, forma: MORBIDO, vita: 0, durata: Infinity });

/** Rettangolo in px CSS, coordinate della finestra (quelle di getBoundingClientRect). */
export type Rettangolo = { l: number; t: number; r: number; b: number };

type FinestraMotore = Pick<Window,
  | "addEventListener" | "removeEventListener" | "requestAnimationFrame" | "cancelAnimationFrame"
  | "setTimeout" | "clearTimeout" | "devicePixelRatio" | "innerWidth" | "innerHeight" | "getComputedStyle" | "scrollY"
> & { matchMedia?: Window["matchMedia"]; ResizeObserver?: typeof ResizeObserver };
type DocumentoMotore = Pick<Document, "hidden" | "addEventListener" | "removeEventListener" | "documentElement">;

export type OpzioniMotore = {
  canvas: HTMLCanvasElement;
  effetto: Effetto;
  /** zone da lasciare libere: modulo di login, interruttore (ricalcolate a resize, scroll e cambi di dimensione di `osserva`) */
  zona?: () => readonly Rettangolo[];
  /** elemento la cui dimensione sposta la zona (es. la card che si allunga con un messaggio d'errore) */
  osserva?: Element | null;
  // iniettabili per i test
  win?: FinestraMotore;
  doc?: DocumentoMotore;
  casuale?: () => number;
  ora?: () => number;
};

export type Motore = { stop(): void; readonly particelle: number; readonly inCorso: boolean };

const SPENTO: Motore = { stop() {}, particelle: 0, inCorso: false };

/** Colore CSS qualsiasi → [r, g, b], normalizzato dal canvas stesso (#rrggbb o rgba(…)); bianco se non valido. */
function rgb(ctx: CanvasRenderingContext2D, colore: string): number[] {
  ctx.fillStyle = "#fff";
  if (colore) ctx.fillStyle = colore;
  const v = String(ctx.fillStyle);
  if (v[0] === "#" && v.length === 7) { const n = parseInt(v.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
}

/** Avvia l'animazione sul canvas. Non parte (e restituisce un motore spento) senza contesto 2D o con prefers-reduced-motion. */
export function avviaMotore(o: OpzioniMotore): Motore {
  const win = o.win ?? window, doc = o.doc ?? document;
  if (typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches) return SPENTO;
  const ctx = o.canvas.getContext("2d");
  return ctx ? motore(ctx, o, win, doc) : SPENTO;
}

function motore(ctx: CanvasRenderingContext2D, o: OpzioniMotore, win: FinestraMotore, doc: DocumentoMotore): Motore {
  const { canvas, effetto } = o;
  const caso = o.casuale ?? Math.random;
  const rnd = (a: number, b: number) => a + (b - a) * caso();

  // colori e gradienti: una volta sola
  const stili = win.getComputedStyle(doc.documentElement);
  const tinte = PALETTE[effetto].map(([token, luce]) =>
    rgb(ctx, stili.getPropertyValue(token).trim()).map((c) => Math.round(c + (255 - c) * luce)));
  const solidi = tinte.map(([r, g, b]) => `rgb(${r},${g},${b})`);
  const bokeh = effetto === "bokeh";
  // gradiente radiale di raggio 1 attorno all'origine: lo stesso oggetto per tutte le particelle, scalato con setTransform
  const morbidi = tinte.map(([r, g, b]) => {
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(${r},${g},${b},${bokeh ? 0.85 : 1})`);
    gr.addColorStop(bokeh ? 0.7 : 0.35, `rgba(${r},${g},${b},${bokeh ? 0.55 : 0.5})`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    return gr;
  });
  const colori = effetto === "foglie" ? 3 : solidi.length; // la venatura delle foglie non è un colore di foglia

  let larghezza = 0, altezza = 0, dpr = 1, mobile = false;
  let raf = 0, ridisegno = 0, ultimo = -1, fermato = false;
  let timerResize: number | undefined; // id di window.setTimeout
  let ridimensionando = false; // raffica di resize in corso: bitmap stirata e zona vecchia, non si disegna
  let zone: Rettangolo[] = [], zonaSporca = true;
  const ora = o.ora ?? (() => performance.now());
  let scrollY = win.scrollY || 0, tScroll = -Infinity, scia = 0; // scia: px che la pagina percorre in ~1 frame
  let prossimoScoppio = 0.4;
  const particelle: Particella[] = [];

  function nasci(p: Particella, iniziale: boolean) {
    const W = larghezza, H = altezza;
    p.x = rnd(0, W); p.vx = 0; p.vy = 0; p.vita = 0; p.durata = Infinity;
    p.f = rnd(0, TAU); p.vf = rnd(0.4, 0.9); p.rot = rnd(0, TAU); p.vr = 0;
    p.c = Math.min(colori - 1, Math.floor(caso() * colori));
    switch (effetto) {
      case "neve": { // cerchi sfumati e qualche fiocco geometrico a tre bracci
        const fiocco = caso() < 0.2;
        p.forma = fiocco ? FIOCCO : MORBIDO;
        p.r = fiocco ? rnd(3.5, 6) : rnd(1.4, 3.6);
        p.y = iniziale ? rnd(0, H) : -p.r - rnd(0, 40);
        p.vy = rnd(12, 22) + p.r * 3;
        p.a = rnd(0.35, 0.8); p.vr = rnd(-0.3, 0.3);
        p.c = caso() < 0.7 ? 0 : 1;
        break;
      }
      case "stelle": { // polvere dorata che scende piano e brilla lentamente
        const stella = caso() < 0.25;
        p.forma = stella ? STELLA : MORBIDO;
        p.r = stella ? rnd(2.5, 4.5) : rnd(0.9, 2.2);
        p.y = iniziale ? rnd(0, H) : -p.r - rnd(0, 30);
        p.vx = rnd(-5, 5); p.vy = rnd(4, 11);
        p.a = rnd(0.4, 0.85); p.vf = rnd(0.9, 2.1); p.vr = rnd(-0.2, 0.2);
        break;
      }
      case "primavera": case "tricolore": case "lumi": { // salgono dal basso
        const tri = effetto === "tricolore", lumi = effetto === "lumi";
        p.forma = lumi ? MORBIDO : tri ? (caso() < 0.5 ? QUADRATO : ROMBO) : FORME_PRIMAVERA[Math.floor(caso() * 4) % 4];
        p.r = lumi ? rnd(1, 2.2) : tri ? rnd(2.5, 4.5) : rnd(3, 7);
        if (tri) p.x = caso() < 0.5 ? rnd(0.02, 0.16) * W : rnd(0.84, 0.98) * W; // solo ai lati
        p.y = iniziale ? rnd(0, H) : H + p.r + rnd(0, 40);
        p.vy = lumi ? -rnd(3, 7) : tri ? -rnd(6, 12) : -rnd(8, 18);
        p.a = lumi ? rnd(0.15, 0.3) : tri ? rnd(0.28, 0.5) : rnd(0.12, 0.3);
        p.vr = rnd(-0.5, 0.5);
        break;
      }
      case "morbide": case "bokeh": { // galleggiano e rientrano dal lato opposto
        p.forma = MORBIDO;
        p.r = bokeh ? (mobile ? rnd(14, 34) : rnd(18, 54)) : rnd(3, 9);
        p.y = rnd(0, H);
        p.vx = bokeh ? rnd(-4, 4) : rnd(-6, 6); p.vy = bokeh ? rnd(-3, 2) : rnd(-6, 6);
        p.a = bokeh ? rnd(0.05, 0.13) : rnd(0.14, 0.32); p.vf = rnd(0.2, 0.6);
        break;
      }
      case "foglie": { // cadono oscillando come un pendolo
        p.forma = FOGLIA;
        p.r = rnd(5, 9);
        p.y = iniziale ? rnd(0, H) : -p.r * 2 - rnd(0, 40);
        p.vy = rnd(10, 20); p.a = rnd(0.35, 0.6); p.vf = rnd(0.6, 1.1); p.rot = rnd(-0.6, 0.6);
        break;
      }
      case "scintille": // spenta finché uno scoppio non la accende
        p.forma = SCINTILLA; p.r = 1.4; p.y = -100; p.durata = 0;
        break;
    }
  }

  /** Capodanno: un fuoco lento (raggiera di scintille che si allarga e svanisce in ~3 s), uno ogni 2,2–3,6 s. */
  function scoppio() {
    const W = larghezza, H = altezza;
    let cx = rnd(0.1, 0.9) * W, cy = rnd(0.08, 0.42) * H;
    for (let i = 0; i < 6 && fattoreZona(cx, cy, 60) < 1; i++) { cx = rnd(0.1, 0.9) * W; cy = rnd(0.08, 0.42) * H; }
    if (fattoreZona(cx, cy, 60) < 1) {
      // telefono: il modulo occupa quasi tutta la larghezza → fascia libera sopra (o sotto) di lui;
      // le scintille dirette verso la card svaniscono nella sfumatura della zona
      const t = Math.min(...zone.map((z) => z.t)), b = Math.max(...zone.map((z) => z.b));
      if (t - MARGINE_ZONA >= 0.08 * H) cy = rnd(0.04 * H, t - MARGINE_ZONA);
      else if (H - b - MARGINE_ZONA >= 0.08 * H) cy = rnd(b + MARGINE_ZONA, H - 0.04 * H);
      else return; // nessuno spazio libero: meglio nessuno scoppio che uno nascosto dietro la card
    }
    const k = mobile ? 9 : 12, c = Math.floor(caso() * colori) % colori, v0 = rnd(26, 44);
    let accese = 0;
    for (const p of particelle) {
      if (accese >= k) break;
      if (p.vita < p.durata) continue; // ancora accesa
      const ang = (accese / k) * TAU + rnd(-0.15, 0.15), v = v0 * rnd(0.75, 1.15);
      p.x = cx; p.y = cy; p.vx = Math.cos(ang) * v; p.vy = Math.sin(ang) * v;
      p.vita = 0; p.durata = rnd(2.4, 3.4); p.a = rnd(0.55, 0.75); p.c = c;
      accese++;
    }
  }

  function aggiorna(dt: number) {
    const W = larghezza, H = altezza;
    if (effetto === "scintille" && (prossimoScoppio -= dt) <= 0) { scoppio(); prossimoScoppio = rnd(2.2, 3.6); }
    for (const p of particelle) {
      p.f += p.vf * dt;
      p.rot += p.vr * dt;
      switch (effetto) {
        case "neve": case "stelle": case "foglie":
          p.x += (p.vx + Math.sin(p.f) * (effetto === "foglie" ? 22 : 9)) * dt;
          p.y += p.vy * dt;
          if (p.y - p.r * 2 > H) nasci(p, false);
          break;
        case "primavera": case "tricolore": case "lumi":
          p.x += Math.sin(p.f) * 8 * dt;
          p.y += p.vy * dt;
          if (p.y + p.r * 2 < 0) nasci(p, false);
          break;
        case "morbide": case "bokeh": {
          p.x += (p.vx + Math.sin(p.f) * 3) * dt;
          p.y += (p.vy + Math.cos(p.f * 0.8) * 3) * dt;
          const m = p.r * 2;
          if (p.y < -m) p.y += H + 2 * m; else if (p.y > H + m) p.y -= H + 2 * m;
          break;
        }
        case "scintille": {
          if (p.vita >= p.durata) continue;
          p.vita += dt;
          const attrito = Math.max(0, 1 - 0.9 * dt);
          p.vx *= attrito; p.vy = p.vy * attrito + 9 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          continue;
        }
      }
      const m = p.r * 2 + 10; // esce da un lato, rientra dall'altro
      if (p.x < -m) p.x += W + 2 * m; else if (p.x > W + m) p.x -= W + 2 * m;
    }
  }

  /** 0 dentro una zona, 1 oltre MARGINE_ZONA px dal bordo di tutte (distanza di Chebyshev meno il raggio). */
  function fattoreZona(x: number, y: number, r: number): number {
    let f = 1;
    for (const z of zone) {
      const d = Math.max(z.l - x, x - z.r, z.t - y, y - z.b) - r;
      if (d <= 0) return 0;
      if (d < MARGINE_ZONA) f = Math.min(f, d / MARGINE_ZONA);
    }
    return f;
  }

  function aggiornaZona() {
    zonaSporca = false;
    const z = o.zona?.();
    // durante lo scroll il DOM si sposta a ogni vsync, il canvas fisso solo ogni ~33 ms:
    // la zona si allarga della strada che il modulo fa nel frattempo (finché lo scroll non si ferma)
    const v = ora() - tScroll < 150 ? scia : 0;
    zone = (z ?? []).map((q) => ({ l: q.l - 6, t: q.t - 6 - v, r: q.r + 6, b: q.b + 6 + v }));
  }

  function forma(p: Particella) {
    if (p.forma === SCINTILLA) { // scia lungo la velocità: si accorcia mentre rallenta
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = solidi[p.c]; ctx.lineWidth = p.r; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.35, p.y - p.vy * 0.35); ctx.stroke();
      return;
    }
    const ang = effetto === "foglie" ? p.rot + Math.sin(p.f) * 0.6 : p.rot;
    const s = p.r * dpr, cs = Math.cos(ang) * s, sn = Math.sin(ang) * s;
    ctx.setTransform(cs, sn, -sn, cs, p.x * dpr, p.y * dpr);
    if (p.forma === MORBIDO) { ctx.fillStyle = morbidi[p.c]; ctx.fillRect(-1, -1, 2, 2); return; }
    if (p.forma === FIOCCO) {
      ctx.strokeStyle = solidi[p.c]; ctx.lineWidth = 0.2; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-1, 0); ctx.lineTo(1, 0);
      ctx.moveTo(-0.5, -0.866); ctx.lineTo(0.5, 0.866);
      ctx.moveTo(0.5, -0.866); ctx.lineTo(-0.5, 0.866);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = solidi[p.c];
    ctx.beginPath();
    switch (p.forma) {
      case CERCHIO: ctx.arc(0, 0, 1, 0, TAU); break;
      case STELLA:
        ctx.moveTo(0, -1); ctx.lineTo(0.28, -0.28); ctx.lineTo(1, 0); ctx.lineTo(0.28, 0.28);
        ctx.lineTo(0, 1); ctx.lineTo(-0.28, 0.28); ctx.lineTo(-1, 0); ctx.lineTo(-0.28, -0.28);
        break;
      case TRIANGOLO: ctx.moveTo(0, -1); ctx.lineTo(0.87, 0.5); ctx.lineTo(-0.87, 0.5); break;
      case ROMBO: ctx.moveTo(0, -1); ctx.lineTo(0.62, 0); ctx.lineTo(0, 1); ctx.lineTo(-0.62, 0); break;
      case QUADRATO: ctx.rect(-0.7, -0.7, 1.4, 1.4); break;
      case FOGLIA: ctx.moveTo(0, -1); ctx.quadraticCurveTo(0.8, 0, 0, 1); ctx.quadraticCurveTo(-0.8, 0, 0, -1); break;
    }
    ctx.closePath();
    ctx.fill();
    if (p.forma === FOGLIA && effetto === "foglie") { // venatura centrale
      ctx.strokeStyle = solidi[3]; ctx.lineWidth = 0.09; ctx.globalAlpha *= 0.5;
      ctx.beginPath(); ctx.moveTo(0, -0.85); ctx.lineTo(0, 0.9); ctx.stroke();
    }
  }

  function disegna() {
    const W = larghezza, H = altezza;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const p of particelle) {
      if (p.vita >= p.durata) continue;
      const r = p.forma === SCINTILLA ? 20 : p.r; // la scia della scintilla resta entro ~20 px dalla testa
      if (p.x + r < 0 || p.x - r > W || p.y + r < 0 || p.y - r > H) continue; // fuori schermo: nessuna draw call
      let alfa = p.a * fattoreZona(p.x, p.y, p.forma === SCINTILLA ? 18 : p.r); // scia lunga al massimo ~18 px
      if (effetto === "stelle") alfa *= 0.55 + 0.45 * Math.sin(p.f); // brillio: sinusoide lenta, mai un lampo
      else if (effetto === "primavera" || effetto === "tricolore" || effetto === "lumi") alfa *= Math.min(1, p.y / (H * 0.15), (H - p.y) / (H * 0.12));
      else if (p.forma === SCINTILLA) alfa *= Math.min(1, p.vita / 0.35) * (1 - p.vita / p.durata) ** 1.6; // entra in 0,35 s, svanisce piano
      if (alfa <= 0.004) continue;
      ctx.globalAlpha = Math.min(1, alfa);
      forma(p);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function dimensiona() {
    ridimensionando = false;
    const w = canvas.clientWidth || win.innerWidth, h = canvas.clientHeight || win.innerHeight;
    dpr = Math.min(win.devicePixelRatio || 1, DPR_MAX);
    const lw = Math.max(1, Math.round(w * dpr)), lh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== lw) canvas.width = lw; // cambiare width/height azzera lo stato del contesto…
    if (canvas.height !== lh) canvas.height = lh;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // …e la trasformazione si reimposta sempre, mai cumulata
    if (larghezza > 0 && altezza > 0) for (const p of particelle) { p.x *= w / larghezza; p.y *= h / altezza; }
    larghezza = w; altezza = h; mobile = w < SOGLIA_MOBILE_PX;
    const n = numeroParticelle(effetto, w);
    while (particelle.length < n) { const p = nuova(); nasci(p, true); particelle.push(p); }
    particelle.length = n;
    aggiornaZona();
    if (!raf) disegna(); // in pausa il ridimensionamento svuota il canvas: ridisegna il fotogramma fermo
  }

  function ciclo(t: number) {
    raf = win.requestAnimationFrame(ciclo);
    const trascorso = ultimo < 0 ? FRAME_MIN_MS : t - ultimo;
    if (trascorso < FRAME_MIN_MS - TOLLERANZA_MS) return; // tetto ~30 fps
    ultimo = t;
    if (ridimensionando) return; // ripartirà da dimensiona(), a raffica finita
    if (zonaSporca) aggiornaZona();
    aggiorna(Math.min(trascorso, 100) / 1000); // dopo una pausa nessun salto
    disegna();
  }

  function avvia() {
    if (raf || fermato) return;
    if (ridisegno) { win.cancelAnimationFrame(ridisegno); ridisegno = 0; }
    ultimo = -1;
    raf = win.requestAnimationFrame(ciclo);
  }

  function pausa() {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
  }

  const suResize = () => {
    if (!ridimensionando) { // primo evento della raffica: via il fotogramma, che il browser ora stira
      ridimensionando = true;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (timerResize !== undefined) win.clearTimeout(timerResize);
    timerResize = win.setTimeout(() => { timerResize = undefined; dimensiona(); }, RESIZE_MS);
  };
  // la zona si è spostata (scroll, card più alta per un errore): in moto la ricalcola il prossimo frame,
  // in pausa un solo ridisegno, così un fotogramma fermo non resta dietro al testo
  const segnaZona = () => {
    zonaSporca = true;
    if (!raf && !ridisegno && !fermato && !ridimensionando && !doc.hidden) {
      ridisegno = win.requestAnimationFrame(() => { ridisegno = 0; aggiornaZona(); disegna(); });
    }
  };

  dimensiona();
  win.addEventListener("resize", suResize, { passive: true });
  const suScroll = () => {
    const y = win.scrollY || 0, t = ora();
    // velocità px/ms (dopo una pausa si conta il primo spostamento su 50 ms) × durata di un frame e mezzo
    scia = Math.min(400, (Math.abs(y - scrollY) / Math.min(Math.max(1, t - tScroll), 50)) * (FRAME_MIN_MS + 20));
    scrollY = y; tScroll = t;
    segnaZona();
  };
  win.addEventListener("scroll", suScroll, { passive: true });
  const ro = o.osserva && win.ResizeObserver ? new win.ResizeObserver(segnaZona) : null;
  if (ro && o.osserva) ro.observe(o.osserva);
  // cambio di devicePixelRatio senza resize (finestra spostata su un altro monitor)
  let togliDpr = () => {};
  const ascoltaDpr = () => {
    togliDpr();
    const mq = typeof win.matchMedia === "function" ? win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`) : null;
    togliDpr = mq ? ascoltaMedia(mq, () => { suResize(); ascoltaDpr(); }) : () => {};
  };
  ascoltaDpr();
  const attivita = osservaAttivita((attivo) => (attivo ? avvia() : pausa()), { win, doc, inattivitaMs: INATTIVITA_MS, ora: o.ora });
  if (attivita.attivo) avvia();

  function stop() {
    if (fermato) return;
    fermato = true;
    pausa();
    if (ridisegno) win.cancelAnimationFrame(ridisegno);
    ridisegno = 0;
    attivita.stop();
    if (timerResize !== undefined) win.clearTimeout(timerResize);
    timerResize = undefined;
    win.removeEventListener("resize", suResize);
    win.removeEventListener("scroll", suScroll);
    ro?.disconnect();
    togliDpr();
    particelle.length = 0;
    canvas.width = 0; // libera subito il backing store (fino a W×H×4×dpr² byte)
    canvas.height = 0;
  }

  return {
    stop,
    get particelle() { return particelle.length; },
    get inCorso() { return raf !== 0; },
  };
}
