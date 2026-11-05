import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/** La stagista in training vede solo /training e /vademecum. */
export default async function VehiclesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "STAGISTA") redirect("/training");
  return <>{children}</>;
}
