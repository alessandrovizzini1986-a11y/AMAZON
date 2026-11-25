/**
 * CSS delle decorazioni festive. Sta DENTRO il chunk JS lazy (iniettato da DecorFestivo con <style precedence>
 * di React 19, che lo porta nell'head una volta sola): un file .css a parte farebbe aggiungere a webpack il
 * caricatore di CSS-chunk nel runtime condiviso da tutte le pagine, cioè byte in più anche nei giorni feriali.
 *
 * - anima solo transform e opacity; colori solo dai design token di globals.css (var(--color-…));
 * - .festa-livello: il canvas entra in dissolvenza (0,8 s, solo opacity) invece di comparire di colpo; non si stampa;
 * - .festa-accento: micro-SVG nell'angolo vuoto in alto a destra del logo (128 px, centrato nella card);
 * - .festa-tricolore: 3 px sul bordo superiore della card, tra i due angoli arrotondati, con un riflesso ogni 8 s;
 * - .festa-bagliore: Ognissanti, bagliore caldo e fermo nel fondale, lontano dal modulo;
 * - .festa-interruttore: bersaglio ≥ 44×44 px, mai nel flusso (non sposta la card). Da 800 px di larghezza
 *   sta fisso nell'angolo in basso a destra, lontano dalla colonna: non allunga mai la pagina (niente barra di
 *   scorrimento che compare e sposta la card di lato). Sotto gli 800 px sta sotto il piè di pagina;
 *   pillola opaca navy (token del fondale): resta leggibile anche dove, su viewport bassi, sporge sotto <main>;
 *   velo di hover e bordo presi dal colore del testo (token) con pseudo-elementi, senza color-mix;
 *   anello di focus bianco con alone navy: visibile su fondale scuro e su sfondo chiaro;
 * - html:has(.festa-accenti): su viewport bassi l'interruttore sporge sotto <main> e lì si vedrebbe lo sfondo chiaro
 *   del body: finché ci sono le decorazioni il fondo della pagina continua il navy del fondale (poi torna da sé);
 *   lo stato si vede dalla posizione del pallino (bianco pieno su navy), non solo dal colore;
 * - forced-colors (contrasto elevato di Windows): pallino e riempimento con colori di sistema, lo stato resta visibile;
 * - .festa-pausa (pagina nascosta o un minuto senza input) ferma gli accenti; con prefers-reduced-motion sono fermi;
 * - curve scritte come cubic-bezier: le parole chiave di easing qui dentro farebbero generare a Tailwind
 *   (che legge anche i .ts) le utility omonime nel CSS globale di tutte le pagine.
 */
export const CSS_FESTIVITA = `
.festa-livello{animation:festa-appare .8s cubic-bezier(0,0,.58,1) both}
.festa-accenti{position:absolute;inset:0;pointer-events:none}
.festa-accento{position:absolute;top:34px;left:calc(50% + 30px);width:20px;height:20px}
.festa-accento svg{display:block;width:100%;height:100%;overflow:visible}
.festa-stella{color:var(--color-warn);animation:festa-brilla 4.5s cubic-bezier(.42,0,.58,1) infinite}
.festa-fiocco{color:var(--color-info);animation:festa-ruota 48s linear infinite}
.festa-foglia{color:var(--color-warn);transform-origin:50% 10%;animation:festa-oscilla 6s cubic-bezier(.42,0,.58,1) infinite}
.festa-tricolore{position:absolute;top:0;left:var(--radius-card);right:var(--radius-card);height:3px;overflow:hidden;border-radius:0 0 2px 2px;animation:festa-entra 1.2s cubic-bezier(0,0,.58,1) both}
.festa-tricolore svg{display:block;width:100%;height:100%}
.festa-tricolore::after{content:"";position:absolute;top:0;bottom:0;left:0;width:30%;background:linear-gradient(90deg,transparent,var(--color-ink-inverse),transparent);opacity:.55;transform:translateX(-120%);animation:festa-luccica 8s cubic-bezier(.42,0,.58,1) 1.5s infinite}
.festa-bagliore{position:absolute;inset:0;opacity:.12;background:radial-gradient(circle at 20% 4%,var(--color-warn-soft),transparent 42%)}
html:has(.festa-accenti){background:var(--color-sidebar-bottom)}
.festa-interruttore{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:8px;isolation:isolate;min-width:44px;min-height:44px;padding:0 14px;display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;background:var(--color-sidebar-bottom);color:var(--color-ink-inverse);font:500 12px/1 var(--font-sans);white-space:nowrap;cursor:pointer;pointer-events:auto}
.festa-interruttore::before,.festa-interruttore::after{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit}
.festa-interruttore::before{background:currentColor;opacity:.08;transition:opacity .15s}
.festa-interruttore::after{border:1px solid currentColor;opacity:.4}
.festa-interruttore:hover::before{opacity:.16}
.festa-interruttore:focus-visible{outline:2px solid var(--color-ink-inverse);outline-offset:2px;box-shadow:0 0 0 6px var(--color-sidebar-bottom)}
.festa-levetta{position:relative;flex:none;width:26px;height:14px;border-radius:999px;border:1.5px solid currentColor}
.festa-levetta::before{content:"";position:absolute;inset:0;border-radius:inherit;background:currentColor;opacity:0}
.festa-levetta::after{content:"";position:absolute;top:2px;left:2px;width:7px;height:7px;border-radius:50%;background:currentColor;transition:transform .2s ease}
.festa-interruttore[aria-pressed="true"] .festa-levetta::before{opacity:.3}
.festa-interruttore[aria-pressed="true"] .festa-levetta::after{transform:translateX(12px)}
@media (min-width:800px){.festa-interruttore{position:fixed;top:auto;left:auto;right:16px;bottom:16px;transform:none;margin:0}}
@media (forced-colors:active){.festa-levetta::after{forced-color-adjust:none;background:ButtonText}.festa-interruttore[aria-pressed="true"] .festa-levetta::before{forced-color-adjust:none;background:Highlight;opacity:1}}
@keyframes festa-appare{from{opacity:0}to{opacity:1}}
@keyframes festa-entra{from{opacity:0;transform:scaleX(.2)}to{opacity:1;transform:scaleX(1)}}
@keyframes festa-luccica{0%,60%{transform:translateX(-120%)}100%{transform:translateX(440%)}}
@keyframes festa-brilla{0%,100%{opacity:.6;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}
@keyframes festa-ruota{to{transform:rotate(360deg)}}
@keyframes festa-oscilla{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
.festa-pausa .festa-stella,.festa-pausa .festa-fiocco,.festa-pausa .festa-foglia,.festa-pausa .festa-tricolore,.festa-pausa .festa-tricolore::after{animation-play-state:paused}
@media print{.festa-livello,.festa-accenti{display:none}}
@media (prefers-reduced-motion:reduce){.festa-stella,.festa-fiocco,.festa-foglia,.festa-tricolore{animation:none}.festa-tricolore::after{display:none}.festa-levetta::after,.festa-interruttore::before{transition:none}}
`;
