import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { Tour } from "@/components/Tour";
import { paginaIniziale } from "@/components/navModel";
import { chiaveTour, haTour, passiTour } from "@/content/tour";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user}>
      {children}
      {haTour(user.role) && <Suspense fallback={null}><TourDiBenvenuto user={user} /></Suspense>}
    </AppShell>
  );
}

/** Tour di benvenuto: parte da solo se l'utente non l'ha ancora fatto con il ruolo che ha adesso. */
async function TourDiBenvenuto({ user }: { user: Awaited<ReturnType<typeof requireUser>> }) {
  const chiave = chiaveTour(user.role);
  let auto = false, promosso = false;
  try {
    auto = !(await db.tourVisto.findUnique({ where: { userId_chiave: { userId: user.id, chiave } }, select: { id: true } }));
    if (auto) {
      // ruolo appena cambiato da un Admin (Utenti → Salva ruolo): il benvenuto lo dice
      const cambio = await db.auditLog.findFirst({ where: { action: "user.role", entityId: user.id }, orderBy: { createdAt: "desc" }, select: { meta: true } });
      const m = cambio?.meta as { da?: string; a?: string } | null | undefined;
      promosso = !!m && m.a === user.role && m.da !== user.role;
    }
  } catch { /* senza database il sito resta usabile: niente tour automatico */ }
  const nome = user.name.trim().split(/\s+/)[0] || user.name;
  return <Tour passi={passiTour({ role: user.role, nome, promosso })} chiave={chiave} auto={auto} home={paginaIniziale(user.role)} />;
}
