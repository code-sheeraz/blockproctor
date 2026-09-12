#!/bin/sh
# Start the Anvil node (state persisted to /app/data so contracts and recorded
# attempts survive container restarts), then auto-deploy the contracts if the
# chain is missing them (fresh volume or wiped state). The node keeps running
# even if deployment fails so it can be retried.
anvil --host 0.0.0.0 --port 8545 --chain-id 31337 --state /app/data/state.json > /app/data/anvil.log 2>&1 &
NODE_PID=$!

# Forward TERM/INT so docker stop lets anvil dump state to disk cleanly
trap 'kill $NODE_PID 2>/dev/null; wait $NODE_PID 2>/dev/null' TERM INT

node scripts/ensureDeployed.mjs

wait $NODE_PID
