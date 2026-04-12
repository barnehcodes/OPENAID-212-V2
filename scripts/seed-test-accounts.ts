import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Fixed test wallets for screenshots. Never use these keys on a public network.
// Import them into MetaMask (chain id 1337, http://localhost:18545) to sign in
// as each role in the UI.
const TEST_KEYS = {
  GO1:  "0x1111111111111111111111111111111111111111111111111111111111111111",
  GO2:  "0x2222222222222222222222222222222222222222222222222222222222222222",
  NGO1: "0x3333333333333333333333333333333333333333333333333333333333333333",
  NGO2: "0x4444444444444444444444444444444444444444444444444444444444444444",
} as const;

const FUND_AMOUNT_ETH = "10";

async function main(): Promise<void> {
  const deploymentsPath = path.join(__dirname, "..", "deployments", "addresses.json");
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`Deployment addresses not found at ${deploymentsPath}. Run deploy.ts first.`);
  }
  const deployed = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
  const registryAddress: string = deployed.contracts.Registry;
  console.log("Using Registry at:", registryAddress);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const registry = await ethers.getContractAt("Registry", registryAddress, deployer);

  // Build signers from raw keys using the Hardhat provider.
  const mkSigner = (key: string) => new ethers.Wallet(key, ethers.provider);
  const go1  = mkSigner(TEST_KEYS.GO1);
  const go2  = mkSigner(TEST_KEYS.GO2);
  const ngo1 = mkSigner(TEST_KEYS.NGO1);
  const ngo2 = mkSigner(TEST_KEYS.NGO2);

  // Fund every test wallet so they can submit transactions.
  const fund = async (to: string, label: string) => {
    const bal = await ethers.provider.getBalance(to);
    if (bal >= ethers.parseEther(FUND_AMOUNT_ETH)) {
      console.log(`  ${label} already funded (${ethers.formatEther(bal)} ETH)`);
      return;
    }
    const tx = await deployer.sendTransaction({ to, value: ethers.parseEther(FUND_AMOUNT_ETH) });
    await tx.wait();
    console.log(`  funded ${label} ${to} with ${FUND_AMOUNT_ETH} ETH`);
  };

  console.log("\n--- Funding test wallets ---");
  for (const [label, key] of Object.entries(TEST_KEYS)) {
    await fund(new ethers.Wallet(key).address, label);
  }

  // Helper: skip if already registered.
  const alreadyRegistered = async (addr: string): Promise<boolean> => {
    const p = await registry.getParticipant(addr);
    return p.exists;
  };

  console.log("\n--- Registering GOs (auto-verified) ---");
  for (const [label, signer] of [["GO1", go1], ["GO2", go2]] as const) {
    if (await alreadyRegistered(signer.address)) {
      console.log(`  ${label} ${signer.address} already registered`);
      continue;
    }
    const tx = await registry.connect(deployer).registerGO(signer.address);
    await tx.wait();
    console.log(`  ${label} ${signer.address} registered (auto-verified)`);
  }

  console.log("\n--- Self-registering NGOs ---");
  for (const [label, signer] of [["NGO1", ngo1], ["NGO2", ngo2]] as const) {
    if (await alreadyRegistered(signer.address)) {
      console.log(`  ${label} ${signer.address} already registered`);
      continue;
    }
    const tx = await registry.connect(signer).registerNGO(signer.address);
    await tx.wait();
    console.log(`  ${label} ${signer.address} self-registered`);
  }

  console.log("\n--- Verifying NGOs (Tier-2 multisig = deployer) ---");
  for (const [label, signer] of [["NGO1", ngo1], ["NGO2", ngo2]] as const) {
    const p = await registry.getParticipant(signer.address);
    if (p.isVerified) {
      console.log(`  ${label} already verified`);
      continue;
    }
    const tx = await registry.connect(deployer).verifyNGO(signer.address, "0x");
    await tx.wait();
    console.log(`  ${label} ${signer.address} verified`);
  }

  console.log("\n--- Summary ---");
  const rows: Array<{ label: string; address: string; privateKey: string; role: string; verified: boolean }> = [];
  for (const [label, key] of Object.entries(TEST_KEYS)) {
    const addr = new ethers.Wallet(key).address;
    const p = await registry.getParticipant(addr);
    const roleNames = ["GO", "NGO", "Donor", "Beneficiary", "PrivateCompany"];
    rows.push({
      label,
      address: addr,
      privateKey: key,
      role: roleNames[Number(p.role)] ?? "?",
      verified: p.isVerified,
    });
  }
  console.table(rows);

  const outPath = path.join(__dirname, "..", "deployments", "test-accounts.json");
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nTest account list saved to ${outPath}`);
  console.log("Import the private keys into MetaMask to sign in as each role.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
