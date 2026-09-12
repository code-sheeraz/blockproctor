// ensureDeployed.mjs
// Waits for the Hardhat node to be ready, checks whether the ProctorChain
// contract is actually deployed (eth_getCode), and runs scripts/deploy.js
// when it is missing or the chain state was reset.
import { spawnSync } from "child_process";
import fs from "fs";

const RPC_URL = process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545";
const ADDRESSES_FILE =
  process.env.BLOCKCHAIN_ADDRESSES_FILE || "/shared/artifacts/blockchain-addresses.env";

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function waitForNode(timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await rpc("eth_blockNumber", []);
      return;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("Blockchain node did not become ready in time");
}

async function isDeployed() {
  try {
    if (!fs.existsSync(ADDRESSES_FILE)) return false;
    const content = fs.readFileSync(ADDRESSES_FILE, "utf8");
    const m = content.match(/^PROCTOR_CHAIN_ADDRESS\s*=\s*(\S+)/m);
    if (!m) return false;
    const address = m[1].trim();
    // Anvil requires the block param for eth_getCode (1-element calls error)
    const code = await rpc("eth_getCode", [address, "latest"]);
    return !!code && code !== "0x";
  } catch (e) {
    return false;
  }
}

await waitForNode();
console.log("✅ Blockchain node is ready");

// Anvil serves RPC before a persisted state file is fully applied, so the
// getCode check below can race the state load and cause a needless redeploy.
// Poll for up to 30s: if the recorded contract becomes visible, skip deploy.
for (let i = 0; i < 15; i++) {
  if (await isDeployed()) {
    console.log("✅ ProctorChain contract already deployed, skipping");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

if (await isDeployed()) {
  console.log("✅ ProctorChain contract already deployed, skipping");
  process.exit(0);
}

console.log("📦 Deploying ProctorChain contract...");
const result = spawnSync("npx", ["hardhat", "run", "scripts/deploy.js", "--network", "localhost"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
