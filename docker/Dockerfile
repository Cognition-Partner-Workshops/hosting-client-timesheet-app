# =============================================================================
# Client Timesheet Application - Multi-Stage Docker Build
# =============================================================================
#
# This Dockerfile creates a production-ready container for the Client Timesheet
# Application using a multi-stage build process to minimize the final image size.
#
# Build Stages:
#   1. frontend-builder: Compiles the React frontend application
#   2. backend-builder: Installs production Node.js dependencies
#   3. production: Creates the final optimized runtime image
#
# Key Features:
#   - Multi-stage build reduces final image size by excluding build tools
#   - Non-root user execution for enhanced security
#   - dumb-init for proper signal handling in containers
#   - Health check endpoint for container orchestration
#   - SQLite data persistence via mounted volume at /app/data
#
# Usage:
#   docker build -t client-timesheet-app .
#   docker run -p 80:3001 -v /path/to/data:/app/data client-timesheet-app
#
# =============================================================================

# =============================================================================
# Stage 1: Frontend Builder
# =============================================================================
# Compiles the React frontend application using Vite. The resulting static
# assets (HTML, CSS, JS) will be served by the Express backend in production.

FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./

RUN npm ci

COPY frontend/ ./

RUN npm run build

# =============================================================================
# Stage 2: Backend Builder
# =============================================================================
# Installs only production dependencies for the Express backend. Development
# dependencies are excluded to reduce the final image size.

FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

COPY backend/package*.json ./

RUN npm ci --only=production

# =============================================================================
# Stage 3: Production Runtime
# =============================================================================
# Creates the final production image with minimal footprint. Includes only
# the compiled frontend, backend source, and production dependencies.

FROM node:20-alpine AS production

WORKDIR /app

# dumb-init acts as PID 1 and properly forwards signals (SIGTERM, SIGINT)
# to the Node.js process, enabling graceful shutdown in container environments
RUN apk add --no-cache dumb-init

# Security: Run as non-root user to limit potential damage from vulnerabilities
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy backend dependencies from builder stage
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY backend/src ./src
COPY backend/package.json ./

# Apply production overrides that configure the server for:
# - Static file serving of the React frontend
# - File-based SQLite storage instead of in-memory
COPY docker/overrides/server.js ./src/server.js
COPY docker/overrides/database/init.js ./src/database/init.js

# Copy compiled frontend assets to be served by Express
COPY --from=frontend-builder /app/frontend/dist ./public

# Create data directory for SQLite database persistence
# This directory should be mounted as a volume in production
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# Environment configuration for production runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/app/data/timesheet.db

# Switch to non-root user for runtime security
USER nodejs

# Document the port the application listens on
EXPOSE 3001

# Container health monitoring configuration
# - Checks /health endpoint every 30 seconds
# - Allows 5 seconds for initial startup
# - Marks unhealthy after 3 consecutive failures
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
