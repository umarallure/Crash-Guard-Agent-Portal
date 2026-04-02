import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColoredProgress } from "@/components/ui/colored-progress";

interface TopVerificationProgressProps {
  submissionId: string;
  verificationSessionId: string;
}

export const TopVerificationProgress = ({ submissionId: _submissionId, verificationSessionId }: TopVerificationProgressProps) => {
  const [progress, setProgress] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    const fetchProgress = async () => {
      const { data: items, error } = await supabase
        .from("verification_items")
        .select("is_verified")
        .eq("session_id", verificationSessionId);
      if (items && Array.isArray(items)) {
        const total = items.length;
        const verified = items.filter((item: any) => item.is_verified).length;
        setTotalCount(total);
        setVerifiedCount(verified);
        setProgress(total > 0 ? Math.round((verified / total) * 100) : 0);
      }
    };
    if (verificationSessionId) {
      fetchProgress();
      intervalId = setInterval(fetchProgress, 2000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [verificationSessionId]);

  let statusText = "Just Started";
  let statusTextClass = "text-rose-700";

  if (progress >= 76) {
    statusText = "Ready for Transfer";
    statusTextClass = "text-emerald-700";
  } else if (progress >= 51) {
    statusText = "Nearly Complete";
    statusTextClass = "text-amber-700";
  } else if (progress >= 26) {
    statusText = "In Progress";
    statusTextClass = "text-orange-700";
  }

  return (
    <div className="rounded-2xl border border-orange-200/70 bg-[linear-gradient(180deg,rgba(255,236,220,0.88)_0%,rgba(255,247,240,0.72)_100%)] px-4 py-4 text-[#4f230e] shadow-[0_18px_36px_-28px_rgba(234,117,38,0.45)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a5c34]">
            Verification Progress
          </div>
          <div className="mt-1 text-sm font-semibold text-[#4f230e]">
            {statusText}
          </div>
          <div className="mt-1 text-xs text-[#7f5234]">
            {verifiedCount} of {totalCount} fields verified
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className={`text-3xl font-bold leading-none tabular-nums ${statusTextClass}`}>
            {progress}%
          </div>
        </div>
      </div>

      <div className="mt-3">
        <ColoredProgress value={progress} className="h-2 border-orange-200/40 bg-white/65 transition-all duration-500" />
      </div>
    </div>
  );
};
