import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { CATEGORIES, docHref, getAllDocs } from "@/lib/vademecum";
import { VademecumNav, type NavGroup } from "./VademecumNav";
import { VademecumSearch } from "./VademecumSearch";

// stampa in A4 orizzontale solo per le pagine del vademecum
const PRINT_CSS = "@media print { @page { size: A4 landscape; margin: 12mm; } body { background: #fff; } }";

export default async function VademecumLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  assertCan(user, "vademecum.view");

  const docs = getAllDocs();
  const groups: NavGroup[] = CATEGORIES.map((category) => ({
    category,
    pages: docs
      .filter((d) => d.category === category)
      .map((d) => ({ href: docHref(d.slug), title: d.slug === "index" ? "Introduzione" : d.title })),
  })).filter((g) => g.pages.length > 0);

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="mb-6 print:hidden">
        <VademecumSearch />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 print:block">
        <aside className="print:hidden lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          <VademecumNav groups={groups} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
