"use client";

import { useAccount } from "wagmi";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { IS_PREVIEW } from "@/lib/previewMode";
import { useMockRole } from "@/components/providers/MockRoleProvider";

export type Role = "GO" | "NGO" | "Donor" | "Beneficiary" | "PrivateCompany";

const roleMap: Record<number, Role> = {
  0: "GO",
  1: "NGO",
  2: "Donor",
  3: "Beneficiary",
  4: "PrivateCompany",
};

const roleIdMap: Record<Role, number> = {
  GO: 0,
  NGO: 1,
  Donor: 2,
  Beneficiary: 3,
  PrivateCompany: 4,
};

export interface Participant {
  addr: string;
  role: Role;
  roleId: number;
  name: string;
  isVerified: boolean;
  isRegistered: boolean;
}

export function useParticipant() {
  const { address, isConnected } = useAccount();
  const mock = useMockRole();

  const { data, isLoading, error } = useScaffoldContractRead({
    contractName: "Registry",
    functionName: "getParticipant",
    args: address ? [address] : undefined,
    enabled: !!address && !IS_PREVIEW,
  });

  if (IS_PREVIEW) {
    const participant: Participant | null = mock.role
      ? {
          addr: mock.address,
          role: mock.role,
          roleId: roleIdMap[mock.role],
          name: mock.name,
          isVerified: mock.isVerified,
          isRegistered: true,
        }
      : null;
    return {
      participant,
      isLoading: false,
      isConnected: true,
      address: mock.address,
      error: null,
    };
  }

  // getParticipant returns a tuple: (address, role, name, isVerified)
  const participant: Participant | null =
    data && isConnected && address
      ? {
          addr: (data as any)[0] as string,
          roleId: Number((data as any)[1]),
          role: roleMap[Number((data as any)[1])] ?? "Donor",
          name: (data as any)[2] as string,
          isVerified: (data as any)[3] as boolean,
          isRegistered: (data as any)[0] !== "0x0000000000000000000000000000000000000000",
        }
      : null;

  return {
    participant,
    isLoading,
    isConnected,
    address,
    error,
  };
}
