import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_URL);
const contractAddress = process.env.CONTRACT_ADDRESS;

// Example ABI (Lock.sol default ABI — replace later if you have a custom contract)
const abi = [
  "function unlockTime() view returns (uint256)",
  "function owner() view returns (address)"
];

export const contract = new ethers.Contract(contractAddress, abi, provider);
export default provider;
