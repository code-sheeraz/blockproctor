// services/blockchainService.js
import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC);
const wallet = new ethers.Wallet("0x" + process.env.PRIVATE_KEY, provider);

const __dirname = path.resolve();
const abiPath = path.join(__dirname, "../blockchain/artifacts/contracts/Lock.sol/Lock.json");

const contractJson = JSON.parse(fs.readFileSync(abiPath, "utf8"));

const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  contractJson.abi,
  wallet
);

// write hashes
export async function setExamHash(hash) {
  const tx = await contract.setExamHash(hash);
  await tx.wait();
  return tx.hash;
}

export async function setAttemptHash(hash) {
  const tx = await contract.setAttemptHash(hash);
  await tx.wait();
  return tx.hash;
}

export async function setLogHash(hash) {
  const tx = await contract.setLogHash(hash);
  await tx.wait();
  return tx.hash;
}

// read hashes using Solidity getters
export async function getExamHash() {
  const hash = await contract.getExamHash();
  return hash;
}

export async function getAttemptHash() {
  const hash = await contract.getAttemptHash();
  return hash;
}

export async function getLogHash() {
  const hash = await contract.getLogHash();
  return hash;
}

export default contract;
