# Base image
FROM node:22-alpine

# Security: pull in patched libcrypto3/libssl3 (CVE-2026-14456 and related
# OpenSSL CVEs, fixed in 3.5.8-r0) — apk upgrade rather than waiting on a
# new node:22-alpine tag, since Alpine's repos patch faster than Docker Hub
# republishes base tags. ARG busts the GHA layer cache so this re-runs
# fresh on every CI build instead of reusing a stale cached layer.
ARG CACHEBUST=1
RUN apk add --no-cache curl && \
    apk upgrade --no-cache libcrypto3 libssl3

# Security: Run as a non-root user
RUN addgroup -g 1007 -S nodejs && adduser -S nodejs -u 1007 -G nodejs

WORKDIR /app

# Copy package files
COPY  --chown=nodejs:nodejs package*.json ./

# Install production dependencies
RUN npm ci --omit=dev && npm cache clean --force && chown -R nodejs:nodejs /app

COPY --chown=nodejs:nodejs . .

USER nodejs

# Run directly from src
CMD ["npm", "run", "start:api"]