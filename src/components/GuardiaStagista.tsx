"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const AMMESSE = ["/training", "/vademecum", "/account"];

/** La stagista in training vede solo il percorso, il vademecum e il proprio account. */
export function GuardiaStagista() {
  const pathname = usePathname(), router = useRouter();
  useEffect(() => {
    if (!AMMESSE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) router.replace("/training");
  }, [pathname, router]);
  return null;
}
