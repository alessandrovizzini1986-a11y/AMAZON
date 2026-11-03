import { PageHeader } from "@/components/ui";
import { utenteCon } from "../dati";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await utenteCon("forecast.view");
  return <PageHeader eyebrow="Fatture Amazon" title="Forecast" subtitle="In arrivo nella prossima fase del modulo." />;
}
