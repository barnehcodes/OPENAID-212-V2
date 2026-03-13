import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeployedAddresses {
  registry: string;
  donationManager: string;
  governance: string;
  reputationEngine: string;
  deployer: string;
  network: string;
  timestamp: string;
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log("---");

  // 1. Deploy Registry
  // Using deployer address as placeholder for all 3 tier authorities
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

  // 3. Deploy Governance (reputationEngine = address(0) for now)
  const Governance = await ethers.getContractFactory("Governance");
  const governance = await Governance.deploy(
    registryAddress,
    donationManagerAddress,
    ethers.ZeroAddress // reputationEngine — wired after deployment
  );
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log("Governance deployed to:", governanceAddress);

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
  console.log("Governance.setReputationEngine() wired");

  console.log("---");
  console.log("All contracts deployed and wired successfully!");

  // Export addresses to JSON
  const addresses: DeployedAddresses = {
    registry: registryAddress,
    donationManager: donationManagerAddress,
    governance: governanceAddress,
    reputationEngine: reputationEngineAddress,
    deployer: deployer.address,
    network: (await ethers.provider.getNetwork()).name,
    timestamp: new Date().toISOString(),
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.join(deploymentsDir, "addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log("Addresses saved to:", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
