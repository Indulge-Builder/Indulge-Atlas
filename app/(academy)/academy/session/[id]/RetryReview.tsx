"use client";

/**
 * RetryReview — recovery control for a closed session whose evaluation never
 * landed (transient evaluator/API failure). Re-runs `retryAcademyEvaluation`
 * and refreshes the RSC so the report renders in place.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { retryAcademyEvaluation } from "@/lib/actions/academy";

export function RetryReview({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRetry() {
    startTransition(async () => {
      const res = await retryAcademyEvaluation(sessionId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Session scored");
      router.refresh();
    });
  }

  return (
    <IndulgeButton
      variant="gold"
      loading={isPending}
      leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
      onClick={handleRetry}
    >
      {isPending ? "Scoring…" : "Score this session"}
    </IndulgeButton>
  );
}
