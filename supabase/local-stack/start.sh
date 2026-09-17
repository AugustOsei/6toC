#!/bin/zsh
# A pocket Supabase on your own machine: Postgres + PostgREST (so row-level security is the
# real thing) + a small stand-in for the auth calls the app makes. Useful for walking through
# invites and the supporter's view without sending any email.
#
#   supabase/local-stack/start.sh          # start it, with seed data
#   npm run dev:local                      # run 6TOC against it
#
# Then, in the browser console, become one of the seeded people:
#   document.cookie = 'sb-127-auth-token=' +
#     await (await fetch('http://127.0.0.1:54400/__cookie?who=olive')).json() + '; path=/'
# `who` is olive (owns a book), sam or tess (accounts with no book).
#
# Needs Postgres 16+ and PostgREST (brew install postgresql@16 postgrest). Nothing here
# listens outside 127.0.0.1, and the JWT secret is a fixed local-only string.
set -e
HERE=${0:A:h}
export LC_ALL=${LC_ALL:-en_US.UTF-8}
export PGDATA=${PGDATA:-${TMPDIR:-/tmp}/6toc-local-pg}
PORT=54330
PSQL=(psql -h 127.0.0.1 -p $PORT -U postgres -q -v ON_ERROR_STOP=1)

[[ -d $PGDATA ]] || initdb -D "$PGDATA" -U postgres --auth=trust > /dev/null
pg_ctl -D "$PGDATA" status > /dev/null 2>&1 ||
  pg_ctl -D "$PGDATA" -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" -l "$PGDATA/log" start

${PSQL[@]} -d postgres -c "drop database if exists sixtoc_local with (force)" -c "create database sixtoc_local"
for file in "$HERE/../tests/00-supabase-stub.sql" "$HERE/../migrations/"*.sql "$HERE/seed.sql"; do
  ${PSQL[@]} -d sixtoc_local -o /dev/null -f "$file"
done

pkill -f "postgrest $HERE/postgrest.conf" 2> /dev/null || true
pkill -f "node $HERE/gateway.mjs" 2> /dev/null || true
postgrest "$HERE/postgrest.conf" > "${TMPDIR:-/tmp}/6toc-postgrest.log" 2>&1 &
node "$HERE/gateway.mjs" > "${TMPDIR:-/tmp}/6toc-gateway.log" 2>&1 &
sleep 2
echo "local stack ready: rest+auth on http://127.0.0.1:54400, database sixtoc_local"
