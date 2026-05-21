"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Sparkles } from "lucide-react";
import { triggerEliaWhatsAppAnalysis } from "@/lib/actions/elia";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { formatIST } from "@/lib/utils/time";

export interface EliaProfileAnalyseButtonProps {
  clientId: string;
  eliaAnalyzedAt: string | null;
  eliaVersion: number;
  /** When true, profile already exists — show "Update Profile" instead of "Analyse Chat" */
  hasProfile: boolean;
  /** Called after a successful run so the parent can reload client detail (elia_profile, etc.). */
  onAnalysisSuccess?: () => void | Promise<void>;
}

export function EliaProfileAnalyseButton({
  clientId,
  eliaAnalyzedAt,
  eliaVersion,
  hasProfile,
  onAnalysisSuccess,
}: EliaProfileAnalyseButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAnalyse() {
    startTransition(async () => {
      const result = await triggerEliaWhatsAppAnalysis(clientId);
      if (!result.success) {
        const msg = result.error ?? "Analysis failed";
        const friendly = msg.startsWith("ELIA_PARSE_ERROR:")
          ? msg.replace(/^ELIA_PARSE_ERROR:\s*/, "")
          : msg;
        toast.error(friendly);
        return;
      }
      if (result.messagesAnalyzed === 0) {
        toast.info("No new messages since last analysis");
        return;
      }
      toast.success(
        `Profile updated — ${result.messagesAnalyzed} message${result.messagesAnalyzed === 1 ? "" : "s"} analysed`,
      );
      await onAnalysisSuccess?.();
      router.refresh();
    });
  }

  const lastAnalysedLabel = eliaAnalyzedAt
    ? (() => {
        try {
          return formatIST(new Date(eliaAnalyzedAt), "d MMM yyyy, h:mm a");
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <IndulgeButton
        variant={hasProfile ? "outline" : "gold"}
        loading={isPending}
        leftIcon={
          hasProfile ? (
            <RefreshCw className="h-3 w-3" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )
        }
        onClick={handleAnalyse}
        className="w-fit text-[13px]"
      >
        {isPending
          ? "Analysing..."
          : hasProfile
            ? "Update Profile"
            : "Analyse Chat"}
      </IndulgeButton>

      {lastAnalysedLabel && (
        <p className="text-[11px] text-stone-400">
          Last analysed {lastAnalysedLabel}
          {eliaVersion > 0 && (
            <span className="ml-1 font-mono text-[10px] text-stone-300">
              v{eliaVersion}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
