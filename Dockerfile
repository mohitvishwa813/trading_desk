# Stage 1: Build the React client
FROM node:18-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Run the production Node.js server
FROM node:18-alpine
WORKDIR /app

# Copy root package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy server files
COPY server.js ./
COPY MarketDataFeed.proto ./

# Copy built React client assets from Stage 1
COPY --from=client-builder /app/client/dist ./client/dist

# Expose server port
EXPOSE 3000

# Set production environment defaults
ENV PORT=3000
ENV NODE_ENV=production

# Run the backend server
CMD ["node", "server.js"]
