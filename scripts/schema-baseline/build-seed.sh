#!/usr/bin/env bash
# Rebuilds prisma/baseline/2026-10-06.seed.sql by copying the dictionary-table INSERT/UPDATE statements VERBATIM from the
# migrations that created them (no production data is read). Run from the repo root.
set -euo pipefail
M=prisma/migrations
O=prisma/baseline/2026-10-06.seed.sql
{
  echo "-- Dictionary/seed rows copied VERBATIM from the migrations that insert them (no production data). Applied by bootstrap after 2026-10-06.sql."
  echo "-- Sources: 20261005220000_fm_memory_schema (213-298), 20261005240000_fm_fx_monthly (24-31), 20261005250000_fm_stock_balance (37-40),"
  echo "--          20261005280000_fm_stock_adjustment (35-37, flag row only), 20261005260000_cfo_kargo_desi_tarife (34-117)."
  echo
  sed -n '213,298p' "$M/20261005220000_fm_memory_schema/migration.sql"
  echo
  sed -n '24,31p' "$M/20261005240000_fm_fx_monthly/migration.sql"
  echo
  sed -n '37,40p' "$M/20261005250000_fm_stock_balance/migration.sql"
  echo
  sed -n '35,37p' "$M/20261005280000_fm_stock_adjustment/migration.sql"
  echo
  sed -n '34,117p' "$M/20261005260000_cfo_kargo_desi_tarife/migration.sql"
} > "$O"
