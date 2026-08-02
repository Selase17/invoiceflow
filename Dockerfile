
# Base image
FROM node:22-alpine

RUN apk add --no-cache curl

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