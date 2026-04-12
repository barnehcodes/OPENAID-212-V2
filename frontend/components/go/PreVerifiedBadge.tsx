import { ShieldCheck } from "lucide-react";

export function PreVerifiedBadge() {
  return (
    <div className="bg-openaid-deep-blue/10 border border-openaid-deep-blue/30 rounded-xl p-4 flex items-center gap-3">
      <ShieldCheck className="w-5 h-5 text-openaid-deep-blue flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-openaid-deep-blue">Pre-Verified Government Organization</p>
        <p className="text-xs text-openaid-dim-text">
          GOs are verified at registration — no additional verification needed
        </p>
      </div>
    </div>
  );
}
