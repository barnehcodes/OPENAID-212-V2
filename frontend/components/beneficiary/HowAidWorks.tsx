import { Card } from "@/components/ui/card";
import { ArrowDown, Coins, Package, UserCheck, CheckCircle2 } from "lucide-react";

const ftSteps = [
  { icon: Coins, label: "Donor sends money", labelAr: "المتبرع يرسل المال", color: "text-openaid-deep-blue", bg: "bg-openaid-deep-blue/10" },
  { icon: UserCheck, label: "Coordinator distributes to you", labelAr: "المنسق يوزع عليك", color: "text-status-amber", bg: "bg-status-amber/10" },
  { icon: CheckCircle2, label: "You confirm receipt", labelAr: "تؤكد الاستلام", color: "text-status-green", bg: "bg-status-green/10" },
];

const ikSteps = [
  { icon: Package, label: "Donor sends item", labelAr: "المتبرع يرسل المواد", color: "text-openaid-blue", bg: "bg-openaid-blue/10" },
  { icon: UserCheck, label: "Coordinator assigns to you", labelAr: "المنسق يعين لك", color: "text-status-amber", bg: "bg-status-amber/10" },
  { icon: CheckCircle2, label: "You confirm receipt", labelAr: "تؤكد الاستلام", color: "text-status-green", bg: "bg-status-green/10" },
];

export function HowAidWorks() {
  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <h3 className="text-base font-semibold text-openaid-black mb-1">How Aid Reaches You</h3>
      <p className="text-xs text-openaid-mid-gray mb-6" dir="rtl">كيف تصلك المساعدات</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* FT path */}
        <div>
          <p className="text-sm font-medium text-openaid-black mb-4">Money (FT)</p>
          <div className="space-y-2">
            {ftSteps.map((step, i) => (
              <div key={step.label}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${step.bg} flex items-center justify-center flex-shrink-0`}>
                    <step.icon className={`w-5 h-5 ${step.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-openaid-black">{step.label}</p>
                    <p className="text-[10px] text-openaid-mid-gray" dir="rtl">{step.labelAr}</p>
                  </div>
                </div>
                {i < ftSteps.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-4 h-4 text-openaid-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* In-kind path */}
        <div>
          <p className="text-sm font-medium text-openaid-black mb-4">Items (In-Kind)</p>
          <div className="space-y-2">
            {ikSteps.map((step, i) => (
              <div key={step.label}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${step.bg} flex items-center justify-center flex-shrink-0`}>
                    <step.icon className={`w-5 h-5 ${step.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-openaid-black">{step.label}</p>
                    <p className="text-[10px] text-openaid-mid-gray" dir="rtl">{step.labelAr}</p>
                  </div>
                </div>
                {i < ikSteps.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-4 h-4 text-openaid-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
