import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getDoc, getPages, renderMarkdown } from "@/lib/vademecum";

export function generateStaticParams() {
  return getPages().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const doc = getDoc((await params).slug);
  return { title: doc ? `${doc.title} — Vademecum` : "Vademecum" };
}

function fmtUpdated(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default async function VademecumPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = slug === "index" ? null : getDoc(slug);
  if (!doc) notFound();

  const pages = getPages();
  const i = pages.findIndex((p) => p.slug === doc.slug);
  const prev = pages[i - 1];
  const next = pages[i + 1];

  return (
    <article>
      <PageHeader eyebrow={`Vademecum · ${doc.category}`} title={doc.title} subtitle={`Aggiornato il ${fmtUpdated(doc.updated)}`} />
      {/* HTML prodotto da renderMarkdown, già sanificato con whitelist */}
      <div className="vd-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }} />
      <nav className="mt-12 flex flex-wrap justify-between gap-3 border-t border-line pt-6 print:hidden" aria-label="Pagine vicine">
        {prev ? (
          <Link href={`/vademecum/${prev.slug}`} className="btn-secondary">← {prev.title}</Link>
        ) : <span />}
        {next && <Link href={`/vademecum/${next.slug}`} className="btn-secondary">{next.title} →</Link>}
      </nav>
    </article>
  );
}
