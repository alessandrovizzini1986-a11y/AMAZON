import type { Config } from "tailwindcss";

// I colori puntano a CSS variables definite in src/app/globals.css (design tokens).
// Sostituire i valori dei token con la palette del Brand Kit Canva senza toccare i componenti.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--color-brand)",
          dark: "var(--color-brand-dark)",
          light: "var(--color-brand-light)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          sunken: "var(--color-surface-sunken)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          muted: "var(--color-ink-muted)",
          faint: "var(--color-ink-faint)",
          inverse: "var(--color-ink-inverse)",
        },
        line: "var(--color-line)",
        // stati semantici: ok / attenzione / scaduto
        ok: { DEFAULT: "var(--color-ok)", soft: "var(--color-ok-soft)" },
        warn: { DEFAULT: "var(--color-warn)", soft: "var(--color-warn-soft)" },
        danger: { DEFAULT: "var(--color-danger)", soft: "var(--color-danger-soft)" },
        info: { DEFAULT: "var(--color-info)", soft: "var(--color-info-soft)" },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
      },
    },
  },
  plugins: [],
};
export default config;
