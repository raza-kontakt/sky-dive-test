#!/bin/sh
set -e

echo "entrypoint: running database migrations"
npx drizzle-kit migrate || true

echo "entrypoint: seeding database if needed"
node /app/seed.cjs

exec "$@"
