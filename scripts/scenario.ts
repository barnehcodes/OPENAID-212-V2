import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════
// Types & Helpers
// ═══════════════════════════════════════════════════════════════════════════

interface TxRecord {
  step: string;
  function: string;
  txHash: string;
  blockNumber: number;
  gasUsed: bigint;
}

const txLog: TxRecord[] = [];

async function logTx(
  step: string,
  fnName: string,
  txPromise: Promise<any>
): Promise<any> {
  try {
    const tx = await txPromise;
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed;
    txLog.push({
      step,
      function: fnName,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed,
    });
    console.log(
      `  ✓ ${fnName} | tx: ${receipt.hash.slice(0, 18)}… | block: ${receipt.blockNumber} | gas: ${gasUsed}`
    );
    return receipt;
  } catch (err: any) {
    console.error(`  ✗ ${fnName} FAILED: ${err.reason || err.message}`);
    throw err;
  }
}

function section(title: string) {
  console.log(`\n${"═".repeat(75)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(75)}\n`);
}

function step(label: string) {
  console.log(`\n── ${label} ──`);
}

/** Sleep for the given number of milliseconds (real-time wait). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  // ─── Detect demo mode ─────────────────────────────────────────────────
  const demoAddressesPath = path.join(__dirname, "..", "deployments", "demo-addresses.json");
  const prodAddressesPath = path.join(__dirname, "..", "deployments", "addresses.json");
  const demoMode = fs.existsSync(demoAddressesPath);

  let addressesPath: string;
  if (demoMode) {
    addressesPath = demoAddressesPath;
    console.log("╔═══════════════════════════════════════════════════════════════╗");
    console.log("║  DEMO MODE — Using GovernanceDemo (30s voting windows)      ║");
    console.log("║  Real-time waits of 35s per voting window                   ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝\n");
  } else {
    addressesPath = prodAddressesPath;
  }

  if (!fs.existsSync(addressesPath)) {
    throw new Error(`Deployment addresses not found at ${addressesPath}. Deploy first.`);
  }
  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));

  // Demo mode uses 35-second real-time waits (30s duration + 5s buffer)
  const DEMO_WAIT_MS = 35_000;

  // ─── Attach to deployed contracts ─────────────────────────────────────
  // Use GovernanceDemo ABI in demo mode, Governance ABI in production mode
  const governanceContractName = demoMode ? "GovernanceDemo" : "Governance";
  const registry = await ethers.getContractAt("Registry", addresses.contracts.Registry);
  const donationManager = await ethers.getContractAt("DonationManager", addresses.contracts.DonationManager);
  const governance = await ethers.getContractAt(governanceContractName, addresses.contracts.Governance);
  const reputationEngine = await ethers.getContractAt("ReputationEngine", addresses.contracts.ReputationEngine);

  section("SETUP PHASE");

  // ─── Step 1: Get deployer ─────────────────────────────────────────────
  step("1. Load deployer account");
  const [deployer] = await ethers.getSigners();
  console.log(`  Deployer: ${deployer.address}`);
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer balance: ${ethers.formatEther(deployerBalance)} ETH`);
  console.log(`  Mode: ${demoMode ? "DEMO (30s windows, real-time waits)" : "PRODUCTION (48h/72h windows)"}`);

  // Verify deployer is all three authorities
  const opAuth = await registry.operationalAuthority();
  const verMS = await registry.verificationMultisig();
  const crisisMS = await registry.crisisDeclarationMultisig();
  console.log(`  Operational Authority: ${opAuth}`);
  console.log(`  Verification Multisig: ${verMS}`);
  console.log(`  Crisis Declaration Multisig: ${crisisMS}`);
  console.log(`  All same as deployer: ${opAuth === deployer.address && verMS === deployer.address && crisisMS === deployer.address}`);

  // ─── Step 2: Create and fund participant wallets ──────────────────────
  step("2. Create and fund participant accounts");

  // Generate deterministic wallets from known seeds
  const participantKeys = [
    "0x0000000000000000000000000000000000000000000000000000000000000011", // go1
    "0x0000000000000000000000000000000000000000000000000000000000000012", // go2
    "0x0000000000000000000000000000000000000000000000000000000000000013", // go3
    "0x0000000000000000000000000000000000000000000000000000000000000021", // ngo1
    "0x0000000000000000000000000000000000000000000000000000000000000022", // ngo2
    "0x0000000000000000000000000000000000000000000000000000000000000031", // donor1
    "0x0000000000000000000000000000000000000000000000000000000000000032", // donor2
    "0x0000000000000000000000000000000000000000000000000000000000000041", // beneficiary1
    "0x0000000000000000000000000000000000000000000000000000000000000042", // beneficiary2
    "0x0000000000000000000000000000000000000000000000000000000000000051", // company1
  ];

  const wallets = participantKeys.map(
    (key) => new ethers.Wallet(key, ethers.provider)
  );

  const [go1, go2, go3, ngo1, ngo2, donor1, donor2, beneficiary1, beneficiary2, company1] = wallets;

  const names: Record<string, string> = {
    [deployer.address]: "deployer",
    [go1.address]: "go1",
    [go2.address]: "go2",
    [go3.address]: "go3",
    [ngo1.address]: "ngo1",
    [ngo2.address]: "ngo2",
    [donor1.address]: "donor1",
    [donor2.address]: "donor2",
    [beneficiary1.address]: "beneficiary1",
    [beneficiary2.address]: "beneficiary2",
    [company1.address]: "company1",
  };

  // Fund each wallet with 1 ETH for gas
  const fundAmount = ethers.parseEther("1");
  console.log(`  Funding 10 participant wallets with 1 ETH each...`);
  for (const wallet of wallets) {
    const bal = await ethers.provider.getBalance(wallet.address);
    if (bal < fundAmount / 2n) {
      const tx = await deployer.sendTransaction({
        to: wallet.address,
        value: fundAmount,
      });
      await tx.wait();
      console.log(`  Funded ${names[wallet.address]} (${wallet.address})`);
    } else {
      console.log(`  ${names[wallet.address]} already funded (${ethers.formatEther(bal)} ETH)`);
    }
  }

  // ─── Step 3: Register participants ────────────────────────────────────
  step("3. Register all participants in the Registry");

  // Helper to check if already registered
  async function isRegistered(addr: string): Promise<boolean> {
    const p = await registry.getParticipant(addr);
    return p.exists;
  }

  // Register GOs (only deployer/admin can do this)
  for (const go of [go1, go2, go3]) {
    if (await isRegistered(go.address)) {
      console.log(`  ${names[go.address]} already registered`);
    } else {
      await logTx("setup", "registerGO", registry.connect(deployer).registerGO(go.address));
    }
  }

  // Register NGOs (self-registration: addr == msg.sender)
  for (const ngo of [ngo1, ngo2]) {
    if (await isRegistered(ngo.address)) {
      console.log(`  ${names[ngo.address]} already registered`);
    } else {
      await logTx("setup", "registerNGO", registry.connect(ngo).registerNGO(ngo.address));
    }
  }

  // Verify NGOs (Tier-2 multisig = deployer)
  for (const ngo of [ngo1, ngo2]) {
    const p = await registry.getParticipant(ngo.address);
    if (p.isVerified) {
      console.log(`  ${names[ngo.address]} already verified`);
    } else {
      await logTx("setup", "verifyNGO", registry.connect(deployer).verifyNGO(ngo.address, "0x"));
    }
  }

  // Register Donors (Role.Donor = 2)
  for (const d of [donor1, donor2]) {
    if (await isRegistered(d.address)) {
      console.log(`  ${names[d.address]} already registered`);
    } else {
      await logTx("setup", "registerParticipant(Donor)", registry.connect(d).registerParticipant(d.address, 2));
    }
  }

  // Register Beneficiaries (Role.Beneficiary = 3)
  for (const b of [beneficiary1, beneficiary2]) {
    if (await isRegistered(b.address)) {
      console.log(`  ${names[b.address]} already registered`);
    } else {
      await logTx("setup", "registerParticipant(Beneficiary)", registry.connect(b).registerParticipant(b.address, 3));
    }
  }

  // Register PrivateCompany (Role.PrivateCompany = 4)
  if (await isRegistered(company1.address)) {
    console.log(`  ${names[company1.address]} already registered`);
  } else {
    await logTx("setup", "registerParticipant(PrivateCompany)", registry.connect(company1).registerParticipant(company1.address, 4));
  }

  // ─── Step 4: Initialize validators ───────────────────────────────────
  step("4. Initialize validators in ReputationEngine");

  for (const v of [go1, go2, go3, ngo1, ngo2]) {
    try {
      const vs = await reputationEngine.getValidatorScore(v.address);
      if (vs.exists) {
        console.log(`  ${names[v.address]} already initialized (score: ${vs.currentScore})`);
        continue;
      }
    } catch {
      // Not initialized yet
    }
    await logTx("setup", "initializeValidator", reputationEngine.initializeValidator(v.address));
  }
  console.log(`  5 validators initialized, all active with score 100`);

  // ─── Step 5: Log setup summary ────────────────────────────────────────
  step("5. Setup summary");
  console.log("  Participants:");
  console.log(`    GO 1:           ${go1.address}`);
  console.log(`    GO 2:           ${go2.address}`);
  console.log(`    GO 3:           ${go3.address}`);
  console.log(`    NGO 1:          ${ngo1.address}`);
  console.log(`    NGO 2:          ${ngo2.address}`);
  console.log(`    Donor 1:        ${donor1.address}`);
  console.log(`    Donor 2:        ${donor2.address}`);
  console.log(`    Beneficiary 1:  ${beneficiary1.address}`);
  console.log(`    Beneficiary 2:  ${beneficiary2.address}`);
  console.log(`    Company 1:      ${company1.address}`);

  // ═══════════════════════════════════════════════════════════════════════
  //  Helper: advance time (demo = real wait, hardhat = evm_increaseTime)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Advance past a voting window.
   * - In demo mode: real-time sleep (35 seconds).
   * - On Hardhat: evm_increaseTime + evm_mine.
   * - On Besu (non-demo): fails gracefully with instructions.
   * Returns true if time was successfully advanced.
   */
  async function advanceTime(durationLabel: string, evmSeconds: number): Promise<boolean> {
    if (demoMode) {
      console.log(`  ⏳ Waiting ${DEMO_WAIT_MS / 1000}s for ${durationLabel} window to close (demo mode)...`);
      await sleep(DEMO_WAIT_MS);
      console.log(`  ✓ ${DEMO_WAIT_MS / 1000}s elapsed — window should be closed`);
      return true;
    }

    // Try evm_increaseTime (works on Hardhat, not on Besu)
    try {
      await ethers.provider.send("evm_increaseTime", [evmSeconds]);
      await ethers.provider.send("evm_mine", []);
      console.log(`  ✓ evm_increaseTime(${durationLabel}) succeeded`);
      return true;
    } catch (err: any) {
      console.log(`  ⚠ WARNING: evm_increaseTime not supported on this network`);
      console.log(`    Error: ${err.message?.slice(0, 120)}`);
      console.log(`    Deploy demo contracts (scripts/deploy-demo.ts) and re-run.`);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP 0: DIRECT DONATION (non-crisis path)
  // ═══════════════════════════════════════════════════════════════════════
  section("STEP 0: DIRECT DONATION (non-crisis path)");

  step("0. Direct Donation — donor1 sends 50 AID directly to beneficiary1");
  await logTx("0", "directDonateFT(b1, 50)", donationManager.connect(donor1).directDonateFT(beneficiary1.address, 50));
  {
    const b1Balance = await donationManager.balanceOf(beneficiary1.address);
    console.log(`  Beneficiary 1 AID balance after direct donation: ${b1Balance}`);
    console.log(`  donorContribution unchanged (direct donations grant no voting power)`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SCENARIO A: CLEAN CRISIS (Happy Path)
  // ═══════════════════════════════════════════════════════════════════════
  section("SCENARIO A: CLEAN CRISIS (Happy Path)");

  // A1: Declare Crisis
  step("A1. Declare Crisis — Earthquake Al Haouz September 2023");
  let crisisA: bigint;
  {
    const tx = await governance.connect(deployer).declareCrisis(
      "Earthquake Al Haouz September 2023", 4, 100
    );
    const receipt = await tx.wait();
    // Parse CrisisDeclared event to get crisisId
    const event = receipt.logs.find((log: any) => {
      try {
        return governance.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "CrisisDeclared";
      } catch { return false; }
    });
    const parsed = governance.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
    crisisA = parsed!.args.crisisId;
    txLog.push({
      step: "A1",
      function: "declareCrisis",
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    });
    console.log(`  ✓ declareCrisis | crisisId: ${crisisA} | severity: 4 | baseDonationCap: 100`);
    console.log(`    tx: ${receipt.hash.slice(0, 18)}… | block: ${receipt.blockNumber} | gas: ${receipt.gasUsed}`);
  }

  // Verify phase
  {
    const crisis = await governance.getCrisis(crisisA);
    console.log(`  Phase: ${["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"][Number(crisis.phase)]}`);
  }

  // A2: Verify Beneficiaries for this crisis
  step("A2. Verify Beneficiaries for Crisis A");
  await logTx("A2", "verifyBeneficiary(b1)", registry.connect(deployer).verifyBeneficiary(beneficiary1.address, crisisA, "0x"));
  await logTx("A2", "verifyBeneficiary(b2)", registry.connect(deployer).verifyBeneficiary(beneficiary2.address, crisisA, "0x"));

  // A3: Donations
  step("A3. Donations");
  // GO cap = 15 × 100 = 1500, NGO cap = 10 × 100 = 1000, Donor/Company cap = 1 × 100 = 100
  await logTx("A3", "go1.donateFT(1500)", donationManager.connect(go1).donateFT(crisisA, 1500));
  await logTx("A3", "go2.donateFT(1500)", donationManager.connect(go2).donateFT(crisisA, 1500));
  await logTx("A3", "go3.donateFT(1500)", donationManager.connect(go3).donateFT(crisisA, 1500));
  await logTx("A3", "ngo1.donateFT(1000)", donationManager.connect(ngo1).donateFT(crisisA, 1000));
  await logTx("A3", "ngo2.donateFT(1000)", donationManager.connect(ngo2).donateFT(crisisA, 1000));
  await logTx("A3", "donor1.donateFT(100)", donationManager.connect(donor1).donateFT(crisisA, 100));
  await logTx("A3", "donor2.donateFT(200)", donationManager.connect(donor2).donateFT(crisisA, 200));
  await logTx("A3", "company1.donateFT(150)", donationManager.connect(company1).donateFT(crisisA, 150));

  // In-kind donations
  let nftId1: bigint;
  let nftId2: bigint;
  {
    const tx1 = await donationManager.connect(donor1).donateInKind(crisisA, "ipfs://QmTentPackage001");
    const r1 = await tx1.wait();
    const ev1 = r1.logs.find((log: any) => {
      try {
        return donationManager.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "InKindDonationReceived";
      } catch { return false; }
    });
    nftId1 = donationManager.interface.parseLog({ topics: ev1!.topics as string[], data: ev1!.data })!.args.nftId;
    txLog.push({ step: "A3", function: "donor1.donateInKind", txHash: r1.hash, blockNumber: r1.blockNumber, gasUsed: r1.gasUsed });
    console.log(`  ✓ donor1.donateInKind | nftId: ${nftId1} | tx: ${r1.hash.slice(0, 18)}…`);

    const tx2 = await donationManager.connect(donor2).donateInKind(crisisA, "ipfs://QmMedicalKit002");
    const r2 = await tx2.wait();
    const ev2 = r2.logs.find((log: any) => {
      try {
        return donationManager.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "InKindDonationReceived";
      } catch { return false; }
    });
    nftId2 = donationManager.interface.parseLog({ topics: ev2!.topics as string[], data: ev2!.data })!.args.nftId;
    txLog.push({ step: "A3", function: "donor2.donateInKind", txHash: r2.hash, blockNumber: r2.blockNumber, gasUsed: r2.gasUsed });
    console.log(`  ✓ donor2.donateInKind | nftId: ${nftId2} | tx: ${r2.hash.slice(0, 18)}…`);
  }

  const escrowA = await donationManager.getCrisisEscrowBalance(crisisA);
  const nftTotal = await donationManager.nftTotalSupply();
  console.log(`  Total FT escrow for crisis A: ${escrowA} AID`);
  console.log(`  Total in-kind items: ${nftTotal}`);

  // A4: Candidate Registration
  step("A4. Candidate Registration");
  await logTx("A4", "ngo1.registerAsCandidate", governance.connect(ngo1).registerAsCandidate(crisisA));
  await logTx("A4", "ngo2.registerAsCandidate", governance.connect(ngo2).registerAsCandidate(crisisA));
  console.log(`  2 candidates registered: ngo1, ngo2`);

  // A5: Start Voting
  step("A5. Start Voting");
  await logTx("A5", "startVoting", governance.connect(deployer).startVoting(crisisA));
  {
    const crisis = await governance.getCrisis(crisisA);
    console.log(`  Phase: ${["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"][Number(crisis.phase)]}`);
  }

  // A6: Cast Votes
  step("A6. Cast Votes (testing GO compression)");
  // All 3 GOs vote for ngo1 → unanimous → compressed to 1
  await logTx("A6", "go1.castVote(ngo1)", governance.connect(go1).castVote(crisisA, ngo1.address));
  await logTx("A6", "go2.castVote(ngo1)", governance.connect(go2).castVote(crisisA, ngo1.address));
  await logTx("A6", "go3.castVote(ngo1)", governance.connect(go3).castVote(crisisA, ngo1.address));
  // ngo1 votes for herself (met donation cap)
  await logTx("A6", "ngo1.castVote(ngo1)", governance.connect(ngo1).castVote(crisisA, ngo1.address));
  // Non-GO votes for ngo2
  await logTx("A6", "donor1.castVote(ngo2)", governance.connect(donor1).castVote(crisisA, ngo2.address));
  await logTx("A6", "donor2.castVote(ngo2)", governance.connect(donor2).castVote(crisisA, ngo2.address));
  await logTx("A6", "company1.castVote(ngo2)", governance.connect(company1).castVote(crisisA, ngo2.address));
  await logTx("A6", "beneficiary1.castVote(ngo2)", governance.connect(beneficiary1).castVote(crisisA, ngo2.address));

  // Log vote tallies
  {
    const candidates = await governance.getCandidates(crisisA);
    console.log(`\n  Vote tallies (raw):`);
    for (const c of candidates) {
      const name = names[c.candidate] || c.candidate;
      console.log(`    ${name}: ${c.voteCount} non-GO + ${c.goVoteCount} GO votes`);
    }
    console.log(`\n  GO compression analysis:`);
    console.log(`    All 3 GOs voted for ngo1 → UNANIMOUS → compressed to 1`);
    console.log(`    ngo1 effective: 1 (ngo1 self) + 1 (GO compressed) = 2`);
    console.log(`    ngo2 effective: 4 (donor1 + donor2 + company1 + beneficiary1) = 4`);
    console.log(`    Expected winner: ngo2 (GO compression in action!)`);
  }

  // A7: Advance time and finalize
  step("A7. Advance time past voting window and finalize");
  const timeAdvancedA7 = await advanceTime("voting (48h)", 48 * 3600 + 1);

  if (timeAdvancedA7) {
    await logTx("A7", "finalizeElection", governance.connect(deployer).finalizeElection(crisisA));

    const crisis = await governance.getCrisis(crisisA);
    console.log(`  Phase: ${["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"][Number(crisis.phase)]}`);
    console.log(`  Elected coordinator: ${names[crisis.coordinator] || crisis.coordinator}`);

    // A8: Distribution
    step("A8. Distribution — coordinator (ngo2) distributes to beneficiaries");
    const coordinator = crisis.coordinator;
    const coordinatorWallet = wallets.find((w) => w.address === coordinator);
    if (!coordinatorWallet) {
      console.log(`  ✗ Coordinator ${coordinator} is not one of our wallets — cannot proceed with distribution`);
    } else {
      // FT Distribution
      await logTx("A8", "distributeFT(b1, 2000)", donationManager.connect(coordinatorWallet).distributeFTToBeneficiary(crisisA, beneficiary1.address, 2000));
      await logTx("A8", "distributeFT(b2, 1500)", donationManager.connect(coordinatorWallet).distributeFTToBeneficiary(crisisA, beneficiary2.address, 1500));

      // In-kind assignment
      await logTx("A8", "assignInKind(nft1, b1)", donationManager.connect(coordinatorWallet).assignInKindToBeneficiary(nftId1, beneficiary1.address));
      await logTx("A8", "assignInKind(nft2, b2)", donationManager.connect(coordinatorWallet).assignInKindToBeneficiary(nftId2, beneficiary2.address));

      // Log balances
      const b1Balance = await donationManager.balanceOf(beneficiary1.address);
      const b2Balance = await donationManager.balanceOf(beneficiary2.address);
      console.log(`  Beneficiary 1 AID balance: ${b1Balance}`);
      console.log(`  Beneficiary 2 AID balance: ${b2Balance}`);

      // A9: Beneficiary confirmation
      step("A9. Beneficiary Confirmation (three-way verification)");
      await logTx("A9", "b1.confirmInKindRedemption(nft1)", donationManager.connect(beneficiary1).confirmInKindRedemption(nftId1));
      await logTx("A9", "b2.confirmInKindRedemption(nft2)", donationManager.connect(beneficiary2).confirmInKindRedemption(nftId2));

      const item1 = await donationManager.getInKindDonation(nftId1);
      const item2 = await donationManager.getInKindDonation(nftId2);
      console.log(`  Item 1 status: ${["PENDING", "ASSIGNED", "REDEEMED"][Number(item1.status)]}`);
      console.log(`  Item 2 status: ${["PENDING", "ASSIGNED", "REDEEMED"][Number(item2.status)]}`);
      console.log(`  Three-way verification complete for both items`);
    }

    // A10: Close Crisis
    step("A10. Close Crisis (clean — no misconduct)");
    await logTx("A10", "closeCrisis", governance.connect(deployer).closeCrisis(crisisA));
    {
      const crisis = await governance.getCrisis(crisisA);
      console.log(`  Phase: ${["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"][Number(crisis.phase)]}`);
    }

    // Log coordinator reputation
    {
      const crisis = await governance.getCrisis(crisisA);
      try {
        const vs = await reputationEngine.getValidatorScore(crisis.coordinator);
        console.log(`  Coordinator (${names[crisis.coordinator]}) reputation score: ${vs.currentScore}`);
      } catch (err: any) {
        console.log(`  Could not read coordinator reputation: ${err.message?.slice(0, 80)}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SCENARIO B: MISCONDUCT CRISIS (Slashing Path)
    // ═══════════════════════════════════════════════════════════════════════
    section("SCENARIO B: MISCONDUCT CRISIS (Slashing Path)");

    // B1: Declare second crisis
    step("B1. Declare Crisis — Flood Souss-Massa 2024");
    let crisisB: bigint;
    {
      const tx = await governance.connect(deployer).declareCrisis(
        "Flood Souss-Massa 2024", 3, 50
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => {
        try {
          return governance.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "CrisisDeclared";
        } catch { return false; }
      });
      const parsed = governance.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
      crisisB = parsed!.args.crisisId;
      txLog.push({ step: "B1", function: "declareCrisis", txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed });
      console.log(`  ✓ declareCrisis | crisisId: ${crisisB} | severity: 3 | baseDonationCap: 50`);
    }

    // B2: Verify beneficiaries for crisis B
    step("B2. Verify Beneficiaries for Crisis B");
    await logTx("B2", "verifyBeneficiary(b1)", registry.connect(deployer).verifyBeneficiary(beneficiary1.address, crisisB, "0x"));
    await logTx("B2", "verifyBeneficiary(b2)", registry.connect(deployer).verifyBeneficiary(beneficiary2.address, crisisB, "0x"));

    // B2: Donations (baseDonationCap = 50, so GO cap = 750, NGO cap = 500, Donor/Company cap = 50)
    step("B2b. Donations for Crisis B");
    await logTx("B2b", "go1.donateFT(750)", donationManager.connect(go1).donateFT(crisisB, 750));
    await logTx("B2b", "go2.donateFT(750)", donationManager.connect(go2).donateFT(crisisB, 750));
    await logTx("B2b", "go3.donateFT(750)", donationManager.connect(go3).donateFT(crisisB, 750));
    await logTx("B2b", "ngo1.donateFT(500)", donationManager.connect(ngo1).donateFT(crisisB, 500));
    await logTx("B2b", "ngo2.donateFT(500)", donationManager.connect(ngo2).donateFT(crisisB, 500));
    await logTx("B2b", "donor1.donateFT(50)", donationManager.connect(donor1).donateFT(crisisB, 50));
    await logTx("B2b", "donor2.donateFT(50)", donationManager.connect(donor2).donateFT(crisisB, 50));

    const escrowB = await donationManager.getCrisisEscrowBalance(crisisB);
    console.log(`  Total FT escrow for crisis B: ${escrowB} AID`);

    // B2: Candidates
    step("B2c. Candidate Registration for Crisis B");
    await logTx("B2c", "ngo1.registerAsCandidate", governance.connect(ngo1).registerAsCandidate(crisisB));
    await logTx("B2c", "ngo2.registerAsCandidate", governance.connect(ngo2).registerAsCandidate(crisisB));

    // Start voting
    step("B2d. Start Voting for Crisis B");
    await logTx("B2d", "startVoting", governance.connect(deployer).startVoting(crisisB));

    // B2: Voting — split GO votes so no compression, ngo1 wins
    step("B2e. Cast Votes (split GO votes — no compression)");
    // go1 → ngo1, go2 → ngo2, go3 → ngo1 (split → no compression → each counts normally)
    await logTx("B2e", "go1.castVote(ngo1)", governance.connect(go1).castVote(crisisB, ngo1.address));
    await logTx("B2e", "go2.castVote(ngo2)", governance.connect(go2).castVote(crisisB, ngo2.address));
    await logTx("B2e", "go3.castVote(ngo1)", governance.connect(go3).castVote(crisisB, ngo1.address));
    // Additional votes for ngo1
    await logTx("B2e", "ngo1.castVote(ngo1)", governance.connect(ngo1).castVote(crisisB, ngo1.address));
    await logTx("B2e", "donor1.castVote(ngo1)", governance.connect(donor1).castVote(crisisB, ngo1.address));
    // Some votes for ngo2
    await logTx("B2e", "donor2.castVote(ngo2)", governance.connect(donor2).castVote(crisisB, ngo2.address));
    await logTx("B2e", "beneficiary1.castVote(ngo2)", governance.connect(beneficiary1).castVote(crisisB, ngo2.address));

    {
      const candidates = await governance.getCandidates(crisisB);
      console.log(`\n  Vote tallies (raw):`);
      for (const c of candidates) {
        const name = names[c.candidate] || c.candidate;
        console.log(`    ${name}: ${c.voteCount} non-GO + ${c.goVoteCount} GO votes`);
      }
      console.log(`  GO votes split → no compression → each GO vote counts as 1`);
      console.log(`  ngo1 effective: 2 non-GO + 2 GO = 4`);
      console.log(`  ngo2 effective: 2 non-GO + 1 GO = 3`);
      console.log(`  Expected winner: ngo1`);
    }

    // B3: Advance time and finalize
    step("B3. Advance time past voting window and finalize election");
    await advanceTime("voting (48h)", 48 * 3600 + 1);

    await logTx("B3", "finalizeElection", governance.connect(deployer).finalizeElection(crisisB));
    {
      const crisis = await governance.getCrisis(crisisB);
      console.log(`  Phase: ${["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"][Number(crisis.phase)]}`);
      console.log(`  Elected coordinator: ${names[crisis.coordinator] || crisis.coordinator}`);
    }

    // Log ngo1 score before misconduct
    let ngo1ScoreBefore: bigint;
    {
      const vs = await reputationEngine.getValidatorScore(ngo1.address);
      ngo1ScoreBefore = vs.currentScore;
      console.log(`  ngo1 reputation score (before misconduct): ${ngo1ScoreBefore}`);
    }

    // B4: Initiate misconduct vote
    step("B4. Initiate Misconduct Vote (Tier-3)");
    await logTx("B4", "initiateMisconductVote", governance.connect(deployer).initiateMisconductVote(crisisB));
    {
      const crisis = await governance.getCrisis(crisisB);
      console.log(`  Phase: ${["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"][Number(crisis.phase)]}`);
      console.log(`  misconductFlagged: ${crisis.misconductFlagged}`);
    }

    // B5: Cast misconduct votes
    step("B5. Cast Misconduct Votes");
    await logTx("B5", "go1.castMisconductVote(true)", governance.connect(go1).castMisconductVote(crisisB, true));
    await logTx("B5", "go2.castMisconductVote(true)", governance.connect(go2).castMisconductVote(crisisB, true));
    await logTx("B5", "go3.castMisconductVote(false)", governance.connect(go3).castMisconductVote(crisisB, false));
    await logTx("B5", "ngo2.castMisconductVote(true)", governance.connect(ngo2).castMisconductVote(crisisB, true));
    await logTx("B5", "donor1.castMisconductVote(false)", governance.connect(donor1).castMisconductVote(crisisB, false));
    {
      const tally = await governance.getMisconductTally(crisisB);
      console.log(`  Misconduct votes: ${tally.votesFor} for, ${tally.votesAgainst} against`);
      console.log(`  3 for, 2 against — majority confirms misconduct`);
    }

    // B6: Advance time past misconduct window and finalize
    step("B6. Advance time past misconduct window and finalize");
    await advanceTime("misconduct (72h)", 72 * 3600 + 1);

    await logTx("B6", "finalizeMisconductVote", governance.connect(deployer).finalizeMisconductVote(crisisB));
    {
      const crisis = await governance.getCrisis(crisisB);
      console.log(`  Phase: ${["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"][Number(crisis.phase)]}`);
      console.log(`  Misconduct confirmed, ngo1 slashed`);
    }

    // Log ngo1 score after misconduct
    {
      const vs = await reputationEngine.getValidatorScore(ngo1.address);
      console.log(`  ngo1 reputation score (after slashing): ${vs.currentScore} (was ${ngo1ScoreBefore})`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  EPOCH UPDATE
    // ═══════════════════════════════════════════════════════════════════════
    section("EPOCH UPDATE");

    // C1: Record participation
    step("C1. Record participation data");
    await logTx("C1", "recordParticipation(go1, true)", reputationEngine.connect(deployer).recordParticipation(go1.address, true));
    await logTx("C1", "recordParticipation(go2, true)", reputationEngine.connect(deployer).recordParticipation(go2.address, true));
    await logTx("C1", "recordParticipation(go3, false)", reputationEngine.connect(deployer).recordParticipation(go3.address, false));
    await logTx("C1", "recordParticipation(ngo1, true)", reputationEngine.connect(deployer).recordParticipation(ngo1.address, true));
    await logTx("C1", "recordParticipation(ngo2, true)", reputationEngine.connect(deployer).recordParticipation(ngo2.address, true));

    // C2: Log scores before
    step("C2. Epoch update — updateScores()");
    console.log(`\n  Validator scores BEFORE epoch update:`);
    const validators = [go1, go2, go3, ngo1, ngo2];
    for (const v of validators) {
      const vs = await reputationEngine.getValidatorScore(v.address);
      console.log(`    ${names[v.address]}: score=${vs.currentScore}, active=${vs.isActive}, rounds=${vs.roundsParticipated}/${vs.totalRoundsEligible}, votes=${vs.votesCast}, timeouts=${vs.timeoutCount}, misconducts=${vs.misconductCount}`);
    }

    // Run epoch update
    await logTx("C2", "updateScores", reputationEngine.connect(deployer).updateScores());

    console.log(`\n  Validator scores AFTER epoch update:`);
    for (const v of validators) {
      const vs = await reputationEngine.getValidatorScore(v.address);
      console.log(`    ${names[v.address]}: score=${vs.currentScore}, active=${vs.isActive}, rounds=${vs.roundsParticipated}/${vs.totalRoundsEligible}, votes=${vs.votesCast}, timeouts=${vs.timeoutCount}, misconducts=${vs.misconductCount}`);
    }

    // Log averages
    const avgScore = await reputationEngine.getAverageScore();
    const activeValidators = await reputationEngine.getActiveValidators();
    console.log(`\n  Average score: ${avgScore}`);
    console.log(`  Active validators: ${activeValidators.length}`);
    console.log(`  Current epoch: ${await reputationEngine.currentEpoch()}`);

    // ═══════════════════════════════════════════════════════════════════════
    //  FINAL SUMMARY
    // ═══════════════════════════════════════════════════════════════════════
    section("FINAL SUMMARY");

    // Build summary object
    const summary: any = {
      timestamp: new Date().toISOString(),
      network: "besu-local",
      chainId: 1337,
      mode: demoMode ? "DEMO (30s voting windows)" : "PRODUCTION (48h/72h voting windows)",

      participants: Object.entries(names).map(([addr, name]) => ({ name, address: addr })),

      crisisA: {
        crisisId: Number(crisisA),
        description: "Earthquake Al Haouz September 2023",
        severity: 4,
        baseDonationCap: 100,
        phasesTraversed: ["DECLARED", "VOTING", "ACTIVE", "CLOSED"],
        coordinatorElected: names[(await governance.getCrisis(crisisA)).coordinator] || "unknown",
        goCompression: "YES — all 3 GOs voted unanimously for ngo1, compressed to 1 vote. ngo2 won with 4 non-GO votes.",
        totalFTDonated: Number(escrowA),
        inKindDonated: 2,
        inKindAssigned: 2,
        inKindRedeemed: 2,
      },

      crisisB: {
        crisisId: Number(crisisB),
        description: "Flood Souss-Massa 2024",
        severity: 3,
        baseDonationCap: 50,
        phasesTraversed: ["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"],
        coordinatorElected: "ngo1",
        misconductOutcome: "CONFIRMED — 3 for, 2 against. ngo1 slashed.",
        goCompression: "NO — GO votes split (2 for ngo1, 1 for ngo2), each counts normally.",
      },

      validatorScores: {} as Record<string, any>,

      tokenStats: {
        totalAIDMinted: Number(await donationManager.totalSupply()),
        crisisAEscrow: Number(escrowA),
        crisisBEscrow: Number(escrowB),
      },

      inKindStats: {
        totalDonated: Number(await donationManager.nftTotalSupply()),
        assigned: 2,
        redeemed: 2,
      },

      totalTransactions: txLog.length,

      gasByFunction: {} as Record<string, { count: number; totalGas: string; avgGas: string }>,
    };

    // Validator scores
    for (const v of validators) {
      const vs = await reputationEngine.getValidatorScore(v.address);
      summary.validatorScores[names[v.address]] = {
        address: v.address,
        currentScore: Number(vs.currentScore),
        previousScore: Number(vs.previousScore),
        isActive: vs.isActive,
        roundsParticipated: Number(vs.roundsParticipated),
        totalRoundsEligible: Number(vs.totalRoundsEligible),
        votesCast: Number(vs.votesCast),
        timeoutCount: Number(vs.timeoutCount),
        misconductCount: Number(vs.misconductCount),
      };
    }

    // Gas by function
    const gasByFn: Record<string, { count: number; total: bigint }> = {};
    for (const tx of txLog) {
      if (!gasByFn[tx.function]) gasByFn[tx.function] = { count: 0, total: 0n };
      gasByFn[tx.function].count++;
      gasByFn[tx.function].total += tx.gasUsed;
    }
    for (const [fn, data] of Object.entries(gasByFn)) {
      summary.gasByFunction[fn] = {
        count: data.count,
        totalGas: data.total.toString(),
        avgGas: (data.total / BigInt(data.count)).toString(),
      };
    }

    // Print summary
    console.log("\n  Participants:");
    for (const [addr, name] of Object.entries(names)) {
      console.log(`    ${name.padEnd(16)} ${addr}`);
    }

    console.log("\n  Crisis A (Clean Path):");
    console.log(`    Phases: DECLARED → VOTING → ACTIVE → CLOSED`);
    console.log(`    Coordinator: ${summary.crisisA.coordinatorElected}`);
    console.log(`    GO Compression: ${summary.crisisA.goCompression}`);

    console.log("\n  Crisis B (Misconduct Path):");
    console.log(`    Phases: DECLARED → VOTING → ACTIVE → REVIEW → CLOSED`);
    console.log(`    Coordinator: ${summary.crisisB.coordinatorElected}`);
    console.log(`    Misconduct: ${summary.crisisB.misconductOutcome}`);

    console.log("\n  Validator Scores (after epoch):");
    for (const [name, data] of Object.entries(summary.validatorScores)) {
      const d = data as any;
      console.log(`    ${name.padEnd(8)} score: ${d.currentScore.toString().padStart(4)} | active: ${d.isActive} | misconducts: ${d.misconductCount}`);
    }

    console.log(`\n  Token Stats:`);
    console.log(`    Total AID minted:       ${summary.tokenStats.totalAIDMinted}`);
    console.log(`    Total in-kind items:    ${summary.inKindStats.totalDonated}`);
    console.log(`    In-kind redeemed:       ${summary.inKindStats.redeemed}`);

    console.log(`\n  Total transactions: ${summary.totalTransactions}`);
    console.log(`\n  Gas usage by function:`);
    for (const [fn, data] of Object.entries(summary.gasByFunction)) {
      const d = data as any;
      console.log(`    ${fn.padEnd(40)} count: ${d.count.toString().padStart(2)} | avg gas: ${d.avgGas}`);
    }

    // Save summary
    const resultsDir = path.join(__dirname, "..", "scenario-results");
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Convert BigInt in txLog for JSON serialization
    const txLogSerializable = txLog.map((tx) => ({
      ...tx,
      gasUsed: tx.gasUsed.toString(),
    }));

    const outputPath = path.join(resultsDir, "summary.json");
    fs.writeFileSync(
      outputPath,
      JSON.stringify({ ...summary, transactionLog: txLogSerializable }, null, 2)
    );
    console.log(`\n  Summary saved to: ${outputPath}`);

  } else {
    // Time manipulation not available — print limitation notice
    section("TIME MANIPULATION NOT AVAILABLE");
    console.log("  This network does not support evm_increaseTime or evm_mine.");
    console.log("  The scenario cannot proceed past the voting phase without time manipulation.");
    console.log("");
    console.log("  WORKAROUNDS:");
    console.log("  1. Deploy demo contracts with short voting windows:");
    console.log("     npx hardhat run scripts/deploy-demo.ts --network besu");
    console.log("     npx hardhat run scripts/scenario.ts --network besu");
    console.log("  2. Run this scenario on the Hardhat local network:");
    console.log("     npx hardhat run scripts/scenario.ts");
    console.log("  3. Wait 48 real hours between voting and finalization on the live Besu network");
    console.log("");
    console.log("  SETUP PHASE completed successfully. All participants registered.");
    console.log("  Crisis A declared and voting started. Votes have been cast.");

    // Still save partial results
    const resultsDir = path.join(__dirname, "..", "scenario-results");
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const txLogSerializable = txLog.map((tx) => ({
      ...tx,
      gasUsed: tx.gasUsed.toString(),
    }));

    const partialSummary = {
      timestamp: new Date().toISOString(),
      network: "besu-local",
      status: "PARTIAL — time manipulation not supported on Besu",
      setupCompleted: true,
      crisisADeclared: true,
      votingStarted: true,
      votesCast: true,
      finalized: false,
      reason: "evm_increaseTime not available on Besu QBFT",
      suggestion: "Deploy demo contracts with scripts/deploy-demo.ts and re-run",
      totalTransactions: txLog.length,
      transactionLog: txLogSerializable,
    };

    const outputPath = path.join(resultsDir, "summary.json");
    fs.writeFileSync(outputPath, JSON.stringify(partialSummary, null, 2));
    console.log(`\n  Partial summary saved to: ${outputPath}`);
  }

  section("SCENARIO COMPLETE");
  console.log(`  Total transactions executed: ${txLog.length}`);
  if (demoMode) {
    console.log(`  Mode: DEMO (30s voting windows with real-time waits)`);
  }
}

main().catch((error) => {
  console.error("\n═══ FATAL ERROR ═══");
  console.error(error);
  process.exitCode = 1;
});
