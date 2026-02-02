# Use Node 18 LTS
FROM node:18

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

# Expose Hardhat node port
EXPOSE 8545

# Default command
CMD ["npx", "hardhat", "node"]
