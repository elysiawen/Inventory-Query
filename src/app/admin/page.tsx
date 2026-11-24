"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/items");
  }, [router]);
  return <div className="text-slate-400">跳转中…</div>;
}
