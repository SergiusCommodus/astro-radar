#!/bin/sh
# Check every link in data/providers.json with curl. Sites and YouTube pages must answer 200; X profiles are checked through
# X's public embed endpoint, which answers 404 for accounts that do not exist.
# Usage: sh scripts/check_providers.sh
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
cd "$(dirname "$0")/.." || exit 1
PY=$(command -v python3 || command -v py)
LIST="import json;[print(p[k]) for p in json.load(open('data/providers.json'))['providers'] for k in ('site','live','social') if p.get(k)]"
fail=0
for u in $("$PY" -c "$LIST" | tr -d '\r'); do
  # no answer (000) or a server error is tried three times, 5 seconds apart: some far away sites (cnsa.gov.cn) drop a connection now and then
  for try in 1 2 3; do
    case "$u" in
      https://x.com/*) code=$(curl -s -o /dev/null -L --max-time 25 -w "%{http_code}" "https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2F${u#https://x.com/}") ;;
      *) code=$(curl -s -o /dev/null -L --max-time 25 -A "$UA" -H "Accept-Language: en-US,en;q=0.9" -w "%{http_code}" "$u") ;;
    esac
    case "$code" in 000|5??) [ "$try" = 3 ] || sleep 5 ;; *) break ;; esac
  done
  [ "$code" = 200 ] || fail=1
  echo "$code $u"
done
exit $fail
