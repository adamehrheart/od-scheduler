# Multi-stage Dockerfile for Open Dealer Scheduler
# Enterprise-grade with development and production targets

# Base stage with common dependencies
FROM node:22-alpine AS base
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    wget \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Development stage
FROM base AS development
# Copy .npmrc for private packages (if it exists)
COPY .npmrc* ./
# Install all dependencies (including dev dependencies)
RUN npm ci
# Copy source code for live reloading
COPY src ./src
# Expose port
EXPOSE 3003
# Start the server directly without doppler for development
CMD ["npm", "run", "dev:docker"]

# Build stage
FROM base AS build
# Install all dependencies (including dev dependencies)
RUN npm ci
# Copy source code
COPY src ./src
# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine AS production
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    wget \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Start the application
CMD ["node", "dist/src/dev-server.js"]
