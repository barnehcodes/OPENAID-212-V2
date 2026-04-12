"use client";

import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { wagmiConfig } from "@/lib/wagmi";
import { MockRoleProvider } from "@/components/providers/MockRoleProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MockRoleProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </MockRoleProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
