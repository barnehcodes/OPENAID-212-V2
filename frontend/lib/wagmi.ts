import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";

export const besuLocal = defineChain({
  id: 1337,
  name: "Besu QBFT Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://localhost:18545"] },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [besuLocal],
  connectors: [injected()],
  transports: {
    [besuLocal.id]: http(),
  },
  ssr: true,
});
