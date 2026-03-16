import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * DEMO DEPLOYMENT — GovernanceDemo with 30-second voting windows
 *
 * Deploys a fresh set of all 4 contracts (does NOT touch the production deployment).
 * Uses GovernanceDemo instead of Governance for short voting/misconduct durations.
 * Saves addresses to deployments/demo-addresses.json.
 */
async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  DEMO DEPLOYMENT — GovernanceDemo (30s voting windows)      ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log("---");

  // 1. Deploy Registry
  const Registry = await ethers.getContractFactory("Registry");
  const registry = await Registry.deploy(
    deployer.address, // operationalAuthority (Tier 1)
    deployer.address, // verificationMultisig (Tier 2)
    deployer.address  // crisisDeclarationMultisig (Tier 3)
  );
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("Registry deployed to:", registryAddress);

  // 2. Deploy DonationManager (governance = address(0) for now)
  const DonationManager = await ethers.getContractFactory("DonationManager");
  const donationManager = await DonationManager.deploy(
    registryAddress,
    ethers.ZeroAddress // governance — wired after deployment
  );
  await donationManager.waitForDeployment();
  const donationManagerAddress = await donationManager.getAddress();
  console.log("DonationManager deployed to:", donationManagerAddress);

  // 3. Deploy GovernanceDemo (reputationEngine = address(0) for now)
  console.log("\n⚡ Using GovernanceDemo (VOTING_DURATION = 30s, MISCONDUCT_VOTE_DURATION = 30s)");
  const GovernanceDemo = await ethers.getContractFactory("GovernanceDemo");
  const governance = await GovernanceDemo.deploy(
    registryAddress,
    donationManagerAddress,
    ethers.ZeroAddress // reputationEngine — wired after deployment
  );
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log("GovernanceDemo deployed to:", governanceAddress);

  // 4. Wire: DonationManager ← Governance
  const txSetGov = await donationManager.setGovernanceContract(governanceAddress);
  await txSetGov.wait();
  console.log("DonationManager.setGovernanceContract() wired");

  // 5. Deploy ReputationEngine (besuPermissioning = address(0) — mock for now)
  const ReputationEngine = await ethers.getContractFactory("ReputationEngine");
  const reputationEngine = await ReputationEngine.deploy(
    registryAddress,
    governanceAddress,
    ethers.ZeroAddress // besuPermissioning — mock for now
  );
  await reputationEngine.waitForDeployment();
  const reputationEngineAddress = await reputationEngine.getAddress();
  console.log("ReputationEngine deployed to:", reputationEngineAddress);

  // 6. Wire: Governance ← ReputationEngine
  const txSetRep = await governance.setReputationEngine(reputationEngineAddress);
  await txSetRep.wait();
  console.log("GovernanceDemo.setReputationEngine() wired");

  console.log("---");
  console.log("All DEMO contracts deployed and wired successfully!");

  // Verify each deployment by calling a view function
  console.log("\n--- Post-deployment verification ---");

  const participant = await registry.getParticipant(deployer.address);
  console.log("Registry.getParticipant(deployer).exists:", participant.exists, "(expected: false)");

  const govAddr = await donationManager.governanceContract();
  console.log("DonationManager.governanceContract():", govAddr);
  console.log("  matches GovernanceDemo?", govAddr === governanceAddress);

  const repAddr = await governance.reputationEngine();
  console.log("GovernanceDemo.reputationEngine():", repAddr);
  console.log("  matches ReputationEngine?", repAddr === reputationEngineAddress);

  const votingDuration = await governance.VOTING_DURATION();
  const misconductDuration = await governance.MISCONDUCT_VOTE_DURATION();
  console.log("GovernanceDemo.VOTING_DURATION():", votingDuration.toString(), "seconds (expected: 30)");
  console.log("GovernanceDemo.MISCONDUCT_VOTE_DURATION():", misconductDuration.toString(), "seconds (expected: 30)");

  const nextCrisisId = await governance.nextCrisisId();
  console.log("GovernanceDemo.nextCrisisId():", nextCrisisId.toString(), "(expected: 1)");

  const currentEpoch = await reputationEngine.currentEpoch();
  console.log("ReputationEngine.currentEpoch():", currentEpoch.toString(), "(expected: 1)");

  console.log("--- Verification complete ---\n");

  // Export addresses to JSON
  const network = await ethers.provider.getNetwork();
  const addresses = {
    network: "besu-local",
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    mode: "DEMO — GovernanceDemo with 30s voting windows",
    durations: {
      VOTING_DURATION: "30 seconds",
      MISCONDUCT_VOTE_DURATION: "30 seconds",
    },
    contracts: {
      Registry: registryAddress,
      DonationManager: donationManagerAddress,
      Governance: governanceAddress,
      ReputationEngine: reputationEngineAddress,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.join(deploymentsDir, "demo-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log("Demo addresses saved to:", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
