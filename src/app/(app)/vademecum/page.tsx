import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { CATEGORIES, getDoc, getPages, renderMarkdown } from "@/lib/vademecum";

export const metadata = { title: "Vademecum — FleetDSP" };

export default function VademecumIndexPage() {
  const intro = getDoc("index");
  const pages = getPages();

  return (
    <div>
      <PageHeader eyebrow="Vademecum" title={intro?.title ?? "Vademecum"} />
      {intro && (
        // HTML prodotto da renderMarkdown, già sanificato con whitelist
        <div className="vd-prose card mb-8 p-5 md:p-7" dangerouslySetInnerHTML={{ __html: renderMarkdown(intro.content) }} />
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CATEGORIES.map((category) => {
          const list = pages.filter((p) => p.category === category);
          if (list.length === 0) return null;
          return (
            <section key={category} className="card p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{category}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {list.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/vademecum/${p.slug}`} className="font-semibold text-brand hover:underline">
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
