import pkg from "hardhat";
import fs from "fs";
import path from "path";
const { ethers } = pkg;

async function main() {
  // Get default account
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy ProctorChain contract
  console.log("\n📦 Deploying ProctorChain...");
  const ProctorChain = await ethers.getContractFactory("ProctorChain");
  const proctorChain = await ProctorChain.deploy();
  await proctorChain.waitForDeployment();
  const proctorChainAddress = await proctorChain.getAddress();
  console.log("✅ ProctorChain deployed to:", proctorChainAddress);

  // Output deployment summary
  console.log("\n" + "=".repeat(60));
  console.log("📋 DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(`ProctorChain: ${proctorChainAddress}`);
  console.log("=".repeat(60));

  // Persist addresses to a shared file (mounted into the backend container)
  const addressesFile = process.env.BLOCKCHAIN_ADDRESSES_FILE || "/shared/artifacts/blockchain-addresses.env";
  try {
    fs.mkdirSync(path.dirname(addressesFile), { recursive: true });
    const content = `PROCTOR_CHAIN_ADDRESS=${proctorChainAddress}\n`;
    const existing = fs.existsSync(addressesFile) ? fs.readFileSync(addressesFile, "utf8") : "";
    if (existing === content) {
      console.log(`✅ Addresses unchanged, skipping write to ${addressesFile}`);
    } else {
      fs.writeFileSync(addressesFile, content);
      console.log(`📝 Addresses written to ${addressesFile}`);
    }
  } catch (err) {
    console.warn(`⚠️ Could not write addresses file: ${err.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
