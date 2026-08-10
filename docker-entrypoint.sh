#!/bin/sh
set -e

DB_FILE="${DB_FILE:-/app/data/app.db}"

if [ ! -f "$DB_FILE" ]; then
  echo "entrypoint: no database at $DB_FILE — seeding from ${BANK_PATH:-data/bank.json}"
  node /app/seed.cjs
fi

exec "$@"
