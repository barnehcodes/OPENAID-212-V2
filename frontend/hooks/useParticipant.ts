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

  // getParticipant returns struct Participant { addr, role, exists, isVerified, registeredAt }
  // viem returns named-component structs as an object, not a tuple.
  const raw = data as
    | { addr: string; role: number | bigint; exists: boolean; isVerified: boolean; registeredAt: bigint }
    | undefined;
  const participant: Participant | null =
    raw && isConnected && address
      ? {
          addr: raw.addr,
          roleId: Number(raw.role),
          role: roleMap[Number(raw.role)] ?? "Donor",
          name: "",
          isVerified: raw.isVerified,
          isRegistered: raw.exists,
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
