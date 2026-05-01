"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

type GuardedReviewDocPageProps = {
  children: ReactNode;
};

export default function GuardedReviewDocPage({ children }: GuardedReviewDocPageProps) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const ok = sessionStorage.getItem("scanner_entry_ok") === "1";
    if (!ok) {
      router.replace("/scanner");
      return;
    }
    setAllowed(true);
  }, [router]);

  if (!allowed) return null;
  return <>{children}</>;
}
