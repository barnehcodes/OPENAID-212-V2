import { ShieldAlert, Eye } from "lucide-react";

export function EscrowBanner() {
  return (
    <div className="space-y-3">
      <div className="bg-openaid-deep-blue/10 border-2 border-openaid-deep-blue/30 rounded-xl p-5 flex items-start gap-4">
        <ShieldAlert className="w-6 h-6 text-openaid-deep-blue flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-openaid-deep-blue">Distribution Authority — Not Balance</h3>
          <p className="text-sm text-openaid-dim-text mt-1">
            You have authority to distribute funds from the crisis escrow to verified beneficiaries.
            Funds stay in the DonationManager contract — you never hold them.
          </p>
        </div>
      </div>
      <div className="bg-openaid-card-bg border border-openaid-border rounded-lg px-4 py-2.5 flex items-center gap-2">
        <Eye className="w-4 h-4 text-openaid-mid-gray" />
        <span className="text-xs font-medium text-openaid-mid-gray">
          All your actions are publicly visible on the blockchain
        </span>
      </div>
    </div>
  );
}
