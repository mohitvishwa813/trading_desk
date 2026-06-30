# Use a lightweight Node image
FROM node:18-alpine
WORKDIR /app

# Copy package configuration files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy server-specific files
COPY server.js ./
COPY MarketDataFeed.proto ./

# Expose the backend port (3000)
EXPOSE 3000

# Set environment variables for production
ENV PORT=3000
ENV NODE_ENV=production

# Start the Node.js server
CMD ["node", "server.js"]
