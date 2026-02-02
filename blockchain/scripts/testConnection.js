// testConnection.js
import { ethers } from "ethers";

async function main() {
  // Hardhat local node RPC
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  // Using the default first private key from Hardhat 
  const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const wallet = new ethers.Wallet(privateKey, provider);

  const balance = await provider.getBalance(wallet.address);

  console.log("Connected wallet address:", wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  //test simple tx
  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: ethers.parseEther("0.001"),
  });

  console.log("Transaction hash:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
