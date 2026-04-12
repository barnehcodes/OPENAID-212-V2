"use client";

import { useAccount } from "wagmi";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";

export type Role = "GO" | "NGO" | "Donor" | "Beneficiary" | "PrivateCompany";

const roleMap: Record<number, Role> = {
  0: "GO",
  1: "NGO",
  2: "Donor",
  3: "Beneficiary",
  4: "PrivateCompany",
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

  const { data, isLoading, error } = useScaffoldContractRead({
    contractName: "Registry",
    functionName: "getParticipant",
    args: address ? [address] : undefined,
    enabled: !!address,
  });

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
