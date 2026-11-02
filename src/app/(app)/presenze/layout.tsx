import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { PresenzeTabs } from "./PresenzeTabs";

export default async function PresenzeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  assertCan(user, "presenze.view");
  return (
    <div>
      <PresenzeTabs />
      {children}
    </div>
  );
}
