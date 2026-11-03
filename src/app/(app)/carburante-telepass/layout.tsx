import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { Tabs } from "./Tabs";

export default async function CarburanteTelepassLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  assertCan(user, "telepass.view");
  return (
    <div>
      <Tabs />
      {children}
    </div>
  );
}
