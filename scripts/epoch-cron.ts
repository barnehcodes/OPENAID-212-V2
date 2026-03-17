import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Epoch Trigger — calls ReputationEngine.updateScores() once and exits.
 *
 * Designed to be invoked by an external scheduler (cron, systemd timer, etc.).
 * Reads contract addresses from demo-addresses.json (if exists) or addresses.json.
 * Handles EpochAlreadyUpdated gracefully (logs and exits 0).
 *
 * Usage:
 *   npx hardhat run scripts/epoch-cron.ts --network besu
 */
async function main(): Promise<void> {
  // ─── Load addresses ─────────────────────────────────────────────────
  const demoPath = path.join(__dirname, "..", "deployments", "demo-addresses.json");
  const prodPath = path.join(__dirname, "..", "deployments", "addresses.json");
  const addressesPath = fs.existsSync(demoPath) ? demoPath : prodPath;

  if (!fs.existsSync(addressesPath)) {
    console.error("No deployment addresses found. Deploy contracts first.");
    process.exitCode = 1;
    return;
  }

  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
  console.log(`Using addresses from: ${path.basename(addressesPath)}`);

  // ─── Attach to ReputationEngine ─────────────────────────────────────
  const reputationEngine = await ethers.getContractAt(
    "ReputationEngine",
    addresses.contracts.ReputationEngine
  );

  const epochBefore = await reputationEngine.currentEpoch();
  console.log(`Current epoch: ${epochBefore}`);

  // ─── Call updateScores() ────────────────────────────────────────────
  try {
    const tx = await reputationEngine.updateScores();
    const receipt = await tx.wait();

    const epochAfter = await reputationEngine.currentEpoch();
    console.log(`updateScores() succeeded`);
    console.log(`  tx: ${receipt.hash}`);
    console.log(`  gas: ${receipt.gasUsed}`);
    console.log(`  epoch: ${epochBefore} → ${epochAfter}`);
  } catch (err: any) {
    // Handle EpochAlreadyUpdated gracefully
    if (
      err.reason?.includes("EpochAlreadyUpdated") ||
      err.message?.includes("EpochAlreadyUpdated")
    ) {
      console.log(`Epoch already updated for epoch ${epochBefore}, skipping.`);
    } else {
      throw err;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
