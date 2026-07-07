import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireUser();
  // il driver atterra sulla sua schermata operativa, gli altri sulla dashboard
  redirect(user.role === "DRIVER" ? "/driver" : "/dashboard");
}
