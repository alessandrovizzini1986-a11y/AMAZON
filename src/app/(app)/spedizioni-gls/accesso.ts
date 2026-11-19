/** Accesso al portale GLS: nome utente, sede e password stanno nella tabella dei portali (password cifrata), mai nel codice. */
export const PORTALE_GLS = "GLS - spedizioni";
export const URL_GLS = "https://www.gls-italy.com/it/login?noholding=yes&firstspirit=5";
export const notaSede = (sede: string) => `Sede: ${sede}`;
export const sedeDaNota = (nota: string | null) => nota?.match(/^Sede:\s*(.+)$/m)?.[1]?.trim() ?? "";
