FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy dependency specifications and install packages
COPY studio/web/package.json studio/web/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy application code
COPY studio/web/ .

# Build arguments for Next.js public client variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_VOICE_SERVER_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_ADMIN_EMAIL

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Compile production Next.js application
RUN pnpm build

# Runner stage
FROM node:20-slim AS runner

RUN npm install -g pnpm

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json /app/pnpm-lock.yaml* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["pnpm", "start", "-H", "0.0.0.0", "-p", "3000"]
