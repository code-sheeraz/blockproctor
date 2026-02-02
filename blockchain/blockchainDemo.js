import crypto from "crypto";
import fs from "fs";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// Connect to blockchain node
const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Load contract ABI
const contractJson = JSON.parse(
  fs.readFileSync("./artifacts/contracts/Lock.sol/Lock.json", "utf8")
);

const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  contractJson.abi,
  wallet
);

// Function to hash JSON file
function hashJsonFile(filePath) {
  const fileData = fs.readFileSync(filePath, "utf8");
  return crypto.createHash("sha256").update(fileData).digest("hex");
}

async function main() {
  try {
    console.log("🚀 Hashing AI Logs...\n");

    const normalHash = hashJsonFile("D:/BlockProctor/blockchain/results/multi.json");
    const noFaceHash = hashJsonFile("D:/BlockProctor/blockchain/results/noface.json");
    const multiFaceHash = hashJsonFile("D:/BlockProctor/blockchain/results/normal.json");

    console.log("Normal Log Hash:", normalHash);
    console.log("No Face Log Hash:", noFaceHash);
    console.log("Multi Face Log Hash:", multiFaceHash, "\n");

    console.log("🔗 Sending log hash to blockchain...");
    
    const tx = await contract.setLogHash(normalHash);
    await tx.wait();

    console.log("✅ Stored on blockchain! TX Hash:", tx.hash);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

main();
