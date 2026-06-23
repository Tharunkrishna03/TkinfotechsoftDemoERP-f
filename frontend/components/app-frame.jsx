"use client";

import { usePathname } from "next/navigation";

import AdminShell from "@/components/admin-shell";

export default function AppFrame({ children }) {
  const pathname = usePathname();

  const content = pathname === "/" ? children : <AdminShell>{children}</AdminShell>;

  return content;
}
