FROM node:22-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Production ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Standalone app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Drizzle for DB migration on startup
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/core/db/schema ./src/core/db/schema
COPY --from=builder /app/package.json ./package.json

# Entrypoint: wait for DB, migrate, then start
COPY <<'EOF' /app/start.sh
#!/bin/sh
echo "Waiting for database..."
RETRIES=30
until node -e "
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  p.query('SELECT 1').then(() => { p.end(); process.exit(0); }).catch(() => { p.end(); process.exit(1); });
" 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: Could not connect to database after 30 attempts"
    echo "Check DATABASE_URL: $DATABASE_URL"
    exit 1
  fi
  echo "DB not ready, retrying... ($RETRIES left)"
  sleep 2
done
echo "Database connected!"

echo "Running DB migrations..."
npx drizzle-kit push --force 2>&1
if [ $? -ne 0 ]; then
  echo "WARNING: Migration may have failed, starting app anyway..."
fi

echo "Starting app..."
exec node server.js
EOF
RUN chmod +x /app/start.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "/app/start.sh"]
