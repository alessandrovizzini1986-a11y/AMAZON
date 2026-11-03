import { PageHeader } from "@/components/ui";
import { utenteCon } from "../dati";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await utenteCon("fatturato.view");
  return <PageHeader eyebrow="Fatture Amazon" title="Fatturato" subtitle="In arrivo nella prossima fase del modulo." />;
}
