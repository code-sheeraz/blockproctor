import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  // 1 week from now
  const ONE_WEEK_IN_SECS = 7 * 24 * 60 * 60;
  const unlockTime = Math.floor(Date.now() / 1000) + ONE_WEEK_IN_SECS;

  // Get default account
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  // Deploy the contract with unlockTime and some value
  const Lock = await ethers.getContractFactory("Lock");
  const lock = await Lock.deploy(unlockTime, { value: ethers.parseEther("1") });

  await lock.waitForDeployment();

  console.log("✅ Lock deployed to:", await lock.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
