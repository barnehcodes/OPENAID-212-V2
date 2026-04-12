"use client";

import { Sidebar } from "@/components/dashboard";
import { useParticipant } from "@/hooks/useParticipant";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { IS_PREVIEW } from "@/lib/previewMode";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address } = useParticipant();

  // Check if connected user is coordinator for any crisis
  // We check crisis #1 as the main crisis - in production this would iterate
  const { data: crisisData } = useScaffoldContractRead({
    contractName: "Governance",
    functionName: "getCrisis",
    args: [BigInt(1)],
    enabled: !!address,
  });

  const coordinator = crisisData ? ((crisisData as any)[2] as string) : undefined;
  const isCoordinator =
    IS_PREVIEW ||
    (!!address &&
      !!coordinator &&
      coordinator.toLowerCase() === address.toLowerCase() &&
      coordinator !== "0x0000000000000000000000000000000000000000");

  return (
    <div className="flex h-screen">
      <Sidebar isCoordinator={isCoordinator} />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
