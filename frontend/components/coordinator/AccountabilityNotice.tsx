import { AlertTriangle } from "lucide-react";

export function AccountabilityNotice() {
  return (
    <div className="bg-status-red/10 border-2 border-status-red/30 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-status-red flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-status-red">Misconduct Consequences</h4>
          <ul className="mt-2 space-y-1.5 text-sm text-openaid-dim-text">
            <li>
              <strong className="text-status-red">Escrow Freeze</strong> — All crisis funds frozen immediately
            </li>
            <li>
              <strong className="text-status-red">Quadratic Penalty</strong> — Reputation score reduced exponentially (n&sup2; scaling)
            </li>
            <li>
              <strong className="text-status-red">Coordinator Ban</strong> — Permanently banned from running for coordinator
            </li>
            <li>
              <strong className="text-status-red">Re-Election</strong> — Crisis enters PAUSED state, new election triggered
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
