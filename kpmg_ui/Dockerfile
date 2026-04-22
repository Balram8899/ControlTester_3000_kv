# Multi-stage build for Agent-Assess application
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /kpmg_ui

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Builder stage
FROM base AS builder
WORKDIR /kpmg_ui

# Copy dependencies from deps stage
COPY --from=deps /kpmg_ui/node_modules ./node_modules

# Copy source code
COPY . .

# Build the application
# This creates:
# - dist/public/ (Vite client build with index.html and assets)
# - dist/index.js (esbuild server bundle)
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /kpmg_ui

# Set production environment
ENV NODE_ENV=production

# Copy package.json for npm start command
COPY --from=builder /kpmg_ui/package.json ./

# Copy built application (includes both server bundle and client static files)
COPY --from=builder /kpmg_ui/dist ./dist

# Copy shared types/schemas (may be referenced by server bundle)
COPY --from=builder /kpmg_ui/shared ./shared

# Copy runtime dependencies. We intentionally keep the full install here
# because the server bundle still touches Vite-side modules at runtime.
COPY --from=deps /kpmg_ui/node_modules ./node_modules

# Create directories for vectorstore data
RUN mkdir -p /kpmg_ui/saved_global_vectorstore /kpmg_ui/saved_company_vectorstore /kpmg_ui/chat_attachment_vectorstore /kpmg_ui/chat_attachments

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser && \
    chown -R appuser:nodejs /kpmg_ui

USER appuser

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "run", "start"]
