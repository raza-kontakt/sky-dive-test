# syntax=docker/dockerfile:1

# ---------- builder: full install, Next build, bundled seeder ----------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1


# Dev dependencies are required here: next build needs typescript and the
# Tailwind PostCSS plugin. Only the traced output is carried to the runner.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# Bundle the TypeScript seeder to plain CommonJS.
RUN npx esbuild scripts/docker-seed.ts \
  --bundle --platform=node --target=node22 --format=cjs \
  --outfile=seed.cjs

# ---------- runner ----------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  BANK_PATH=/app/seed-data/bank.json \
  EXPLANATIONS_PATH=/app/seed-data/explanations.json

# server.js plus its traced node_modules; static assets and public/ are not
# copied into standalone by Next, so they come over separately.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Seeding inputs. The bank lives outside /app/data because that path is a
# volume mount and would shadow anything baked into the image there.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/seed.cjs ./seed.cjs
# The bracket on explanations.jso[n] makes that file optional: it is generated
# by `npm run explain` and may not exist. bank.json always matches, so the COPY
# succeeds either way.
COPY --from=builder /app/data/bank.json /app/data/explanations.jso[n] ./seed-data/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/data \
  && chown -R node:node /app/data \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
