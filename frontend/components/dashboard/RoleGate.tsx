"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useParticipant, type Role } from "@/hooks/useParticipant";
import { Skeleton } from "@/components/ui/skeleton";

interface RoleGateProps {
  /** Allowed roles for this page */
  allowedRoles: Role[];
  children: React.ReactNode;
}

const roleRoutes: Record<Role, string> = {
  Donor: "/dashboard/donor",
  Beneficiary: "/dashboard/beneficiary",
  NGO: "/dashboard/ngo",
  GO: "/dashboard/go",
  PrivateCompany: "/dashboard/donor",
};

export function RoleGate({ allowedRoles, children }: RoleGateProps) {
  const router = useRouter();
  const { participant, isLoading, isConnected } = useParticipant();

  useEffect(() => {
    if (isLoading) return;

    if (!isConnected) {
      router.replace("/register");
      return;
    }

    if (!participant?.isRegistered) {
      router.replace("/register");
      return;
    }

    if (!allowedRoles.includes(participant.role)) {
      router.replace(roleRoutes[participant.role] ?? "/dashboard");
    }
  }, [isLoading, isConnected, participant, allowedRoles, router]);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-4 gap-4 mt-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!participant?.isRegistered || !allowedRoles.includes(participant.role)) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Dashboard home — auto-redirects to role-specific page.
 */
export function DashboardRedirect() {
  const router = useRouter();
  const { participant, isLoading, isConnected } = useParticipant();

  useEffect(() => {
    if (isLoading) return;

    if (!isConnected || !participant?.isRegistered) {
      router.replace("/register");
      return;
    }

    router.replace(roleRoutes[participant.role] ?? "/dashboard/donor");
  }, [isLoading, isConnected, participant, router]);

  return (
    <div className="p-8 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
