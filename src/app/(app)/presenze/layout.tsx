import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { PresenzeTabs } from "./PresenzeTabs";

export default async function PresenzeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  assertCan(user, "presenze.view");
  return (
    <div>
      <PresenzeTabs config={can(user, "presenze.config")} />
      {children}
    </div>
  );
}
