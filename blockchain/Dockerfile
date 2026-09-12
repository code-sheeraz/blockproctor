# Use Node 18 LTS
FROM node:20

# Install Foundry (provides the `anvil` node). Pinned release + retries because
# GitHub release downloads can be flaky over HTTP/2.
RUN curl --http1.1 --retry 5 --retry-all-errors -L -o /tmp/foundry.tar.gz \
      https://github.com/foundry-rs/foundry/releases/download/v1.7.1/foundry_v1.7.1_linux_amd64.tar.gz \
    && tar -xzf /tmp/foundry.tar.gz -C /usr/local/bin \
    && rm /tmp/foundry.tar.gz \
    && anvil --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Ensure Hardhat runs in ESM mode
RUN npm install

# ✅ Set Hardhat to use ES Modules
COPY . .

# Add this line (important)
ENV NODE_OPTIONS="--experimental-specifier-resolution=node"

EXPOSE 8545

# Default command: start node with persisted data, then auto-deploy contracts
CMD ["sh", "start.sh"]
