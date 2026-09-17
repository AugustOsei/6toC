#!/bin/zsh
# Runs the row-level-security tests against a throwaway local Postgres, so the rules that
# keep one person's book out of another person's hands are checked without touching
# Supabase. Needs Postgres 16+ on PATH (brew install postgresql@16).
#
#   supabase/tests/run.sh
#
# The cluster lives in a temporary folder, listens on 127.0.0.1:54329 only, and is left
# running between runs (stop it with: pg_ctl -D "$PGDATA" stop).
set -e
HERE=${0:A:h}
export LC_ALL=${LC_ALL:-en_US.UTF-8}   # Postgres refuses to start without a valid locale.
export PGDATA=${PGDATA:-${TMPDIR:-/tmp}/6toc-test-pg}
PORT=54329
PSQL=(psql -h 127.0.0.1 -p $PORT -U postgres -q -v ON_ERROR_STOP=1)

if [[ ! -d $PGDATA ]]; then
  initdb -D "$PGDATA" -U postgres --auth=trust > /dev/null
fi
# A unix socket path inside a temporary folder is usually too long, so TCP only.
pg_ctl -D "$PGDATA" status > /dev/null 2>&1 ||
  pg_ctl -D "$PGDATA" -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" -l "$PGDATA/log" start

${PSQL[@]} -d postgres -c "drop database if exists sixtoc_test with (force)" -c "create database sixtoc_test"
for file in "$HERE/00-supabase-stub.sql" "$HERE/../migrations/"*.sql "$HERE/10-rls-tests.sql"; do
  ${PSQL[@]} -d sixtoc_test -o /dev/null -f "$file"
done
