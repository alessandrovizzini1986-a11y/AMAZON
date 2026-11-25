import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Effetto } from "@/domain/festivita";
import { ascoltaMedia, EVENTI_INPUT } from "@/components/festivita/attivita";
import {
  avviaMotore, DPR_MAX, FRAME_MIN_MS, INATTIVITA_MS, numeroParticelle, RESIZE_MS, SOGLIA_MOBILE_PX, TETTO,
  type OpzioniMotore, type Rettangolo,
} from "@/components/festivita/motore";

const EFFETTI: Effetto[] = ["neve", "stelle", "primavera", "scintille", "morbide", "bokeh", "foglie", "tricolore", "lumi"];

/** EventTarget finto che conta i listener (tipo + fase di cattura, come il browser) per scovare i leak. */
class Bersaglio {
  ascoltatori = new Map<string, Set<EventListenerOrEventListenerObject>>();
  private chiave(tipo: string, o?: boolean | AddEventListenerOptions | EventListenerOptions) {
    return `${tipo}|${typeof o === "boolean" ? o : !!o?.capture}`;
  }
  addEventListener(tipo: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) {
    const k = this.chiave(tipo, o);
    if (!this.ascoltatori.has(k)) this.ascoltatori.set(k, new Set());
    this.ascoltatori.get(k)!.add(fn);
  }
  removeEventListener(tipo: string, fn: EventListenerOrEventListenerObject, o?: boolean | EventListenerOptions) {
    this.ascoltatori.get(this.chiave(tipo, o))?.delete(fn);
  }
  emetti(tipo: string) {
    for (const [k, fns] of this.ascoltatori) {
      if (!k.startsWith(`${tipo}|`)) continue;
      for (const fn of [...fns]) (typeof fn === "function" ? fn : fn.handleEvent.bind(fn))(new Event(tipo));
    }
  }
  get totale() { let n = 0; for (const s of this.ascoltatori.values()) n += s.size; return n; }
}

class MqFinta extends Bersaglio {
  constructor(public media: string, public matches: boolean) { super(); }
}

const TOKEN: Record<string, string> = {
  "--color-ink-inverse": "#ffffff", "--color-brand-light": "#eaf0f7", "--color-brand": "#123e73",
  "--color-warn": "#a86300", "--color-warn-soft": "#fdf1dc", "--color-ok": "#17754a", "--color-danger": "#b3261e", "--color-info": "#21618c",
};

/** generatore pseudo-casuale con seme: test ripetibili */
const lcg = (seme = 7) => () => (seme = (seme * 1664525 + 1013904223) % 4294967296) / 4294967296;

function ambiente(o: { w?: number; h?: number; dpr?: number; ridotto?: boolean } = {}) {
  const win = new Bersaglio() as Bersaglio & Record<string, unknown>;
  const rafs = new Map<number, FrameRequestCallback>();
  let seq = 0;
  const mqs: MqFinta[] = [];
  Object.assign(win, {
    innerWidth: o.w ?? 1280, innerHeight: o.h ?? 800, devicePixelRatio: o.dpr ?? 1,
    requestAnimationFrame: (cb: FrameRequestCallback) => { const i = ++seq; rafs.set(i, cb); return i; },
    cancelAnimationFrame: (i: number) => { rafs.delete(i); },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    matchMedia: (q: string) => { const mq = new MqFinta(q, q.includes("reduce") ? !!o.ridotto : false); mqs.push(mq); return mq; },
    getComputedStyle: () => ({ getPropertyValue: (k: string) => TOKEN[k] ?? "" }),
  });
  const doc = new Bersaglio() as Bersaglio & { hidden: boolean; documentElement: object };
  doc.hidden = false;
  doc.documentElement = {};
  /** esegue i requestAnimationFrame in sospeso al tempo t (ms) */
  const tick = (t: number) => { const cbs = [...rafs.values()]; rafs.clear(); for (const cb of cbs) cb(t); };
  return { win, doc, rafs, tick, mqs };
}

/** un disegno: tipo, opacità, trasformazione attiva e punti del tracciato (moveTo/lineTo) */
type Chiamata = { tipo: string; alfa: number; t: number[]; punti: number[][] };
function tela(w = 1280, h = 800) {
  const reg = { clear: 0, disegni: [] as Chiamata[], trasformazioni: [] as number[][], larghezze: [] as number[] };
  let ultimaT: number[] = [1, 0, 0, 1, 0, 0], punti: number[][] = [];
  const ctx: Record<string, unknown> = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "butt", globalAlpha: 1,
    setTransform: (...a: number[]) => { ultimaT = a; reg.trasformazioni.push(a); },
    clearRect: () => { reg.clear++; },
    beginPath: () => { punti = []; },
    moveTo: (x: number, y: number) => { punti.push([x, y]); },
    lineTo: (x: number, y: number) => { punti.push([x, y]); },
    closePath() {}, arc() {}, rect() {}, quadraticCurveTo() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  for (const tipo of ["fillRect", "fill", "stroke"]) ctx[tipo] = () => reg.disegni.push({ tipo, alfa: ctx.globalAlpha as number, t: ultimaT, punti });
  // guardrail: niente ombre né filtri (costosi per frame)
  for (const k of ["shadowBlur", "shadowColor", "shadowOffsetX", "shadowOffsetY", "filter"]) {
    Object.defineProperty(ctx, k, { get: () => 0, set: () => { throw new Error(`${k} non ammesso`); } });
  }
  let width = 300, height = 150;
  const canvas = {
    clientWidth: w, clientHeight: h, getContext: () => ctx,
    get width() { return width; }, set width(v: number) { width = v; reg.larghezze.push(v); },
    get height() { return height; }, set height(v: number) { height = v; },
  };
  return { canvas, ctx, reg };
}

function avvia(effetto: Effetto, o: { w?: number; h?: number; dpr?: number; ridotto?: boolean; zona?: () => Rettangolo[] } = {}) {
  const amb = ambiente(o), t = tela(o.w, o.h);
  const m = avviaMotore({
    canvas: t.canvas as unknown as HTMLCanvasElement, effetto, zona: o.zona,
    win: amb.win as unknown as OpzioniMotore["win"], doc: amb.doc as unknown as OpzioniMotore["doc"],
    casuale: lcg(), ora: () => Date.now(),
  });
  return { m, ...amb, ...t };
}

/** fa girare `secondi` di frame a `hz` partendo da t0; restituisce quanti frame sono stati disegnati */
function gira(x: ReturnType<typeof avvia>, secondi: number, hz = 60, t0 = 1000, jitter = 0) {
  const prima = x.reg.clear, passo = 1000 / hz;
  for (let i = 1; i <= secondi * hz; i++) x.tick(t0 + i * passo + (i % 2 ? jitter : -jitter));
  return x.reg.clear - prima;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("tetto di particelle", () => {
  it("telefono (< 768 px) al massimo 25–35, desktop al massimo 60–75", () => {
    expect(TETTO.mobile).toBeGreaterThanOrEqual(25);
    expect(TETTO.mobile).toBeLessThanOrEqual(35);
    expect(TETTO.desktop).toBeGreaterThanOrEqual(60);
    expect(TETTO.desktop).toBeLessThanOrEqual(75);
    for (const e of EFFETTI) {
      for (const w of [320, 375, SOGLIA_MOBILE_PX - 1]) expect(numeroParticelle(e, w), `${e} a ${w}px`).toBeLessThanOrEqual(TETTO.mobile);
      for (const w of [SOGLIA_MOBILE_PX, 1280, 2560]) expect(numeroParticelle(e, w), `${e} a ${w}px`).toBeLessThanOrEqual(TETTO.desktop);
      expect(numeroParticelle(e, 375)).toBeGreaterThan(0);
    }
  });

  it("il motore rispetta il tetto alla larghezza reale del canvas", () => {
    for (const e of EFFETTI) {
      const tel = avvia(e, { w: 375, h: 812 }), desk = avvia(e, { w: 1440, h: 900 });
      expect(tel.m.particelle).toBe(numeroParticelle(e, 375));
      expect(desk.m.particelle).toBe(numeroParticelle(e, 1440));
      tel.m.stop(); desk.m.stop();
    }
  });
});

describe("frame rate ~30 fps", () => {
  it.each([[60, 0], [60, 0.9], [90, 0], [120, 0], [144, 0], [240, 0]])("display a %i Hz (jitter ±%f ms)", (hz, jitter) => {
    const x = avvia("neve");
    const frame = gira(x, 2, hz, 1000, jitter);
    expect(frame / 2).toBeLessThanOrEqual(1000 / (FRAME_MIN_MS - 2) + 0.5);
    expect(frame / 2).toBeGreaterThanOrEqual(27);
    x.m.stop();
  });
});

describe("devicePixelRatio e resize", () => {
  it("DPR limitato a 2, trasformazione reimpostata (mai cumulata)", () => {
    const x = avvia("neve", { w: 1280, h: 800, dpr: 3 });
    expect(DPR_MAX).toBe(2);
    expect(x.canvas.width).toBe(2560);
    expect(x.canvas.height).toBe(1600);
    expect(x.reg.trasformazioni[0]).toEqual([2, 0, 0, 2, 0, 0]);
    gira(x, 1);
    expect(x.reg.trasformazioni.at(-1)).toEqual([2, 0, 0, 2, 0, 0]); // ogni frame si chiude tornando alla base
    x.m.stop();
  });

  it("DPR mancante o frazionario", () => {
    const a = avvia("neve", { dpr: 0 }), b = avvia("neve", { dpr: 1.5 });
    expect(a.canvas.width).toBe(1280);
    expect(b.canvas.width).toBe(1920);
    a.m.stop(); b.m.stop();
  });

  it("debounce: una raffica di resize produce un solo ridimensionamento, al tetto del telefono", () => {
    const x = avvia("neve", { w: 1280, h: 800, dpr: 2 });
    const prima = x.reg.larghezze.length;
    x.canvas.clientWidth = 375; x.canvas.clientHeight = 812;
    for (let i = 0; i < 6; i++) { x.win.emetti("resize"); vi.advanceTimersByTime(30); }
    expect(x.reg.larghezze.length).toBe(prima); // ancora nulla: la raffica non è finita
    vi.advanceTimersByTime(RESIZE_MS);
    expect(x.reg.larghezze.slice(prima)).toEqual([750]);
    expect(x.canvas.height).toBe(1624);
    expect(x.m.particelle).toBe(numeroParticelle("neve", 375));
    expect(x.reg.trasformazioni.at(-1)).toEqual([2, 0, 0, 2, 0, 0]);
    x.m.stop();
  });
});

describe("pause: pagina nascosta e inattività", () => {
  it("visibilitychange: cancella subito il rAF e riprende quando la pagina torna visibile", () => {
    const x = avvia("stelle");
    expect(x.m.inCorso).toBe(true);
    x.doc.hidden = true; x.doc.emetti("visibilitychange");
    expect(x.rafs.size).toBe(0);
    expect(x.m.inCorso).toBe(false);
    expect(gira(x, 1)).toBe(0);
    x.doc.hidden = false; x.doc.emetti("visibilitychange");
    expect(x.rafs.size).toBe(1);
    expect(gira(x, 1)).toBeGreaterThan(25);
    x.m.stop();
  });

  it.each(EVENTI_INPUT)("60 s senza input mettono in pausa, «%s» la toglie", (evento) => {
    const x = avvia("neve");
    vi.advanceTimersByTime(INATTIVITA_MS - 1);
    expect(x.m.inCorso).toBe(true);
    vi.advanceTimersByTime(1);
    expect(x.m.inCorso).toBe(false);
    expect(x.rafs.size).toBe(0);
    x.win.emetti(evento);
    expect(x.m.inCorso).toBe(true);
    vi.advanceTimersByTime(INATTIVITA_MS); // e si riaddormenta dopo un altro minuto
    expect(x.m.inCorso).toBe(false);
    x.m.stop();
  });

  it("l'input continuo non crea timer (un solo timer di inattività, riarmato alla scadenza)", () => {
    const x = avvia("neve");
    const timer = vi.getTimerCount();
    for (let i = 0; i < 500; i++) { x.win.emetti("mousemove"); vi.advanceTimersByTime(100); }
    expect(vi.getTimerCount()).toBe(timer);
    expect(x.m.inCorso).toBe(true);
    x.m.stop();
  });

  it("la pagina che torna visibile conta come input anche dopo un lungo periodo nascosta", () => {
    const x = avvia("neve");
    x.doc.hidden = true; x.doc.emetti("visibilitychange");
    vi.advanceTimersByTime(5 * INATTIVITA_MS);
    x.doc.hidden = false; x.doc.emetti("visibilitychange");
    expect(x.m.inCorso).toBe(true);
    x.m.stop();
  });
});

describe("prefers-reduced-motion", () => {
  it("con movimento ridotto il motore non parte e non registra nulla", () => {
    const x = avvia("neve", { ridotto: true });
    expect(x.m.inCorso).toBe(false);
    expect(x.rafs.size).toBe(0);
    expect(x.win.totale + x.doc.totale).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("smontaggio senza leak", () => {
  it.each(EFFETTI)("%s: rAF, listener, media query e timer azzerati; memoria del canvas liberata", (e) => {
    const x = avvia(e, { dpr: 2 });
    gira(x, 2);
    x.win.emetti("resize"); // con un debounce in sospeso
    expect(x.win.totale).toBeGreaterThan(0);
    x.m.stop();
    expect(x.rafs.size).toBe(0);
    expect(x.win.totale).toBe(0);
    expect(x.doc.totale).toBe(0);
    expect(x.mqs.reduce((n, mq) => n + mq.totale, 0)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(x.canvas.width).toBe(0);
    expect(x.canvas.height).toBe(0);
    expect(x.m.particelle).toBe(0);
    expect(() => x.m.stop()).not.toThrow(); // idempotente
  });

  it("cambio di devicePixelRatio (altro monitor): un solo listener attivo alla volta", () => {
    const x = avvia("neve", { dpr: 1 });
    const dpr1 = x.mqs.find((q) => q.media.includes("resolution"))!;
    expect(dpr1.totale).toBe(1);
    (x.win as Record<string, unknown>).devicePixelRatio = 2;
    dpr1.emetti("change");
    expect(dpr1.totale).toBe(0);
    expect(x.mqs.filter((q) => q.media.includes("resolution")).reduce((n, q) => n + q.totale, 0)).toBe(1);
    vi.advanceTimersByTime(RESIZE_MS);
    expect(x.canvas.width).toBe(2560);
    x.m.stop();
    expect(x.mqs.reduce((n, mq) => n + mq.totale, 0)).toBe(0);
  });
});

describe("non interferenza con il modulo di login", () => {
  it.each(EFFETTI)("%s: nessun disegno se la zona copre tutto lo schermo", (e) => {
    const x = avvia(e, { zona: () => [{ l: 0, t: 0, r: 1280, b: 800 }] });
    gira(x, 4);
    expect(x.reg.clear).toBeGreaterThan(100);
    expect(x.reg.disegni).toHaveLength(0);
    x.m.stop();
  });

  it.each(EFFETTI)("%s: nessuna particella (né scia) tocca la zona del modulo (card + piè di pagina)", (e) => {
    const zona: Rettangolo = { l: 448, t: 150, r: 832, b: 650 }; // colonna max-w-sm centrata
    const x = avvia(e, { zona: () => [zona] });
    gira(x, 8);
    expect(x.reg.disegni.length).toBeGreaterThan(0);
    const tocca = (l: number, t: number, r: number, b: number) => r > zona.l && l < zona.r && b > zona.t && t < zona.b;
    for (const c of x.reg.disegni) {
      const base = c.t[0] === 1 && c.t[1] === 0 && c.t[4] === 0 && c.t[5] === 0;
      if (base) { // scintille: segmento in coordinate di pagina
        for (const [px, py] of c.punti) expect(tocca(px, py, px, py), `${e}: scia a (${px.toFixed(0)}, ${py.toFixed(0)})`).toBe(false);
        continue;
      }
      // dpr = 1: traslazione = centro, scala = raggio; la forma sta nel quadrato [-1, 1]
      const [cx, cy, r] = [c.t[4], c.t[5], Math.hypot(c.t[0], c.t[1])];
      expect(tocca(cx - r, cy - r, cx + r, cy + r), `${e}: particella a (${cx.toFixed(0)}, ${cy.toFixed(0)}) r ${r.toFixed(1)}`).toBe(false);
    }
    x.m.stop();
  });

  it.each(EFFETTI)("%s: più zone (colonna + interruttore nell'angolo), nessuna toccata e niente zona unica gigante", (e) => {
    const colonna: Rettangolo = { l: 448, t: 150, r: 832, b: 650 }, angolo: Rettangolo = { l: 1100, t: 740, r: 1264, b: 784 };
    const x = avvia(e, { zona: () => [colonna, angolo] });
    gira(x, 8);
    const dentro = (c: Chiamata, z: Rettangolo) => {
      if (c.t[0] === 1 && c.t[1] === 0 && c.t[4] === 0 && c.t[5] === 0) return c.punti.some(([px, py]) => px > z.l && px < z.r && py > z.t && py < z.b);
      const [cx, cy, r] = [c.t[4], c.t[5], Math.hypot(c.t[0], c.t[1])];
      return cx + r > z.l && cx - r < z.r && cy + r > z.t && cy - r < z.b;
    };
    for (const c of x.reg.disegni) { expect(dentro(c, colonna)).toBe(false); expect(dentro(c, angolo)).toBe(false); }
    // lo spazio tra colonna e angolo resta disponibile (con un'unica zona che le unisse sarebbe vuoto)
    const tra: Rettangolo = { l: 900, t: 300, r: 1060, b: 700 };
    if (!["tricolore", "scintille", "lumi"].includes(e)) expect(x.reg.disegni.some((c) => dentro(c, tra))).toBe(true); // effetti radi: troppo poche particelle per contarci
    x.m.stop();
  });

  it.each(EFFETTI)("%s: opacità bassa e numeri sempre finiti", (e) => {
    const x = avvia(e);
    gira(x, 20);
    for (const c of x.reg.disegni) {
      expect(c.alfa).toBeLessThanOrEqual(0.85);
      expect(c.t.every(Number.isFinite)).toBe(true);
    }
    x.m.stop();
  });
});

describe("geometria che cambia: resize e scroll", () => {
  const tocca = (c: Chiamata, z: Rettangolo) => {
    const base = c.t[0] === 1 && c.t[1] === 0 && c.t[4] === 0 && c.t[5] === 0;
    if (base) return c.punti.some(([px, py]) => px > z.l && px < z.r && py > z.t && py < z.b);
    const [cx, cy, r] = [c.t[4], c.t[5], Math.hypot(c.t[0], c.t[1])];
    return cx + r > z.l && cx - r < z.r && cy + r > z.t && cy - r < z.b;
  };

  it("durante una raffica di resize non disegna (bitmap stirata, zona vecchia), poi riparte", () => {
    const x = avvia("neve", { zona: () => [{ l: 448, t: 150, r: 832, b: 650 }] });
    gira(x, 1);
    x.canvas.clientWidth = 1000; x.canvas.clientHeight = 600;
    x.win.emetti("resize");
    const disegni = x.reg.disegni.length;
    for (let i = 0; i < 5; i++) { gira(x, 0.1, 60, 3000 + i * 100); x.win.emetti("resize"); vi.advanceTimersByTime(100); }
    expect(x.reg.disegni.length).toBe(disegni);
    vi.advanceTimersByTime(RESIZE_MS);
    expect(x.canvas.width).toBe(1000);
    gira(x, 0.5, 60, 5000);
    expect(x.reg.disegni.length).toBeGreaterThan(disegni);
    x.m.stop();
  });

  it("scroll veloce: nessuna particella dove il modulo arriverà prima del frame successivo", () => {
    let scrollY = 0;
    const zona = () => ({ l: 448, t: 150 - scrollY, r: 832, b: 650 - scrollY });
    const x = avvia("neve", { zona: () => [zona()] });
    const passo = 1000 / 60, v = 25; // 1500 px/s
    for (let i = 1; i <= 90; i++) {
      scrollY += v;
      (x.win as Record<string, unknown>).scrollY = scrollY;
      x.win.emetti("scroll");
      vi.advanceTimersByTime(passo);
      const n = x.reg.disegni.length;
      x.tick(1000 + i * passo);
      const dopo = zona(), futura = { ...dopo, t: dopo.t - 2 * v, b: dopo.b - 2 * v }; // fra 2 vsync (33 ms)
      for (const c of x.reg.disegni.slice(n)) {
        expect(tocca(c, dopo), "zona attuale").toBe(false);
        expect(tocca(c, futura), "zona fra un frame").toBe(false);
      }
    }
    x.m.stop();
  });

  it("Capodanno su telefono: gli scoppi si vedono (fascia libera) e mai dietro la card", () => {
    const zona: Rettangolo = { l: 16, t: 147, r: 359, b: 717 }; // 375×812: card + piè di pagina + interruttore
    const x = avvia("scintille", { w: 375, h: 812, zona: () => [zona] });
    let frame = 0, scintille = 0;
    for (let i = 1; i <= 60 * 30; i++) {
      const n = x.reg.disegni.length, c = x.reg.clear;
      x.tick(1000 + (i * 1000) / 60);
      if (x.reg.clear === c) continue;
      frame++;
      const nuovi = x.reg.disegni.slice(n);
      scintille += nuovi.length;
      for (const d of nuovi) expect(tocca(d, zona)).toBe(false);
    }
    expect(scintille / frame).toBeGreaterThan(3); // prima della correzione: ~0,6 per frame
    x.m.stop();
  });
});

describe("Capodanno: fuochi lenti, nessun lampeggio", () => {
  it("al massimo uno scoppio ogni 2,2 s (WCAG 2.3.1: < 3 lampi al secondo) e scintille che entrano in dissolvenza", () => {
    const x = avvia("scintille");
    const passo = 1000 / 60;
    let precedente = 0, scoppi = 0, primo: number[] | null = null;
    for (let i = 1; i <= 60 * 60; i++) { // 60 s a 60 Hz
      const n = x.reg.disegni.length, c = x.reg.clear;
      x.tick(1000 + i * passo);
      if (x.reg.clear === c) continue; // frame saltato dal tetto fps
      const frame = x.reg.disegni.slice(n);
      if (frame.length >= precedente + 5) { scoppi++; primo ??= frame.map((d) => d.alfa); }
      precedente = frame.length;
    }
    expect(scoppi).toBeGreaterThanOrEqual(Math.floor(60 / 3.6) - 1);
    expect(scoppi).toBeLessThanOrEqual(Math.ceil(60 / 2.2) + 1);
    // primo scoppio (nessuna scintilla prima): nel frame in cui compare è appena accennato, poi sale in 0,35 s
    expect(primo).not.toBeNull();
    expect(Math.max(...primo!)).toBeLessThan(0.2);
    x.m.stop();
  });
});

describe("ascoltaMedia", () => {
  it("usa addListener sui browser che non hanno addEventListener sulle media query", () => {
    const chiamate: string[] = [];
    const mq = { addListener: () => chiamate.push("add"), removeListener: () => chiamate.push("remove") } as unknown as MediaQueryList;
    ascoltaMedia(mq, () => {})();
    expect(chiamate).toEqual(["add", "remove"]);
  });
});
