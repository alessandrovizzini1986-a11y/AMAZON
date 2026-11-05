import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";

export const metadata = { title: "Training — FleetDSP" };

export default async function TrainingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  assertCan(user, "training.view");
  return <div className="training">{children}</div>;
}
