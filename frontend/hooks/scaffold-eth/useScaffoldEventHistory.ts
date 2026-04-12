"use client";

import { useWatchContractEvent } from "wagmi";
import { contracts, type ContractName } from "@/contracts/deployedContracts";
import { useState, useCallback } from "react";
import type { Log } from "viem";

interface UseScaffoldEventHistoryConfig {
  contractName: ContractName;
  eventName: string;
  fromBlock?: bigint;
  enabled?: boolean;
}

export function useScaffoldEventHistory({
  contractName,
  eventName,
  enabled = true,
}: UseScaffoldEventHistoryConfig) {
  const contract = contracts[contractName];
  const [events, setEvents] = useState<Log[]>([]);

  const onLogs = useCallback((logs: Log[]) => {
    setEvents(prev => [...prev, ...logs]);
  }, []);

  useWatchContractEvent({
    address: contract.address,
    abi: contract.abi,
    eventName,
    onLogs,
    enabled,
  });

  return { data: events };
}
