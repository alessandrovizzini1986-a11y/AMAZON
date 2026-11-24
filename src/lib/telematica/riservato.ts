/** Portali i cui accessi permettono di comandare i mezzi (Targa Telematics, FlottaWeb): riservati al super admin. */
export const riservato = (portale: string) => /targa|flottaweb/.test(portale.toLowerCase().replace(/\s+/g, ""));
