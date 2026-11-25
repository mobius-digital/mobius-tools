#!/usr/bin/env bash
# Builds the folder that goes to Cloudflare Pages: the app's own static files
# and nothing else.
#
#   bash .github/pages/build-site.sh <out-dir> [tools|locus]
#
# It is an allow-list three times over:
#   1. only the root files and folders named below are looked at, so a new
#      folder stays private until someone adds it here;
#   2. inside those folders only files git tracks, with a browser file type,
#      are copied (no notes, no scripts, no config);
#   3. folders that hold worker source or working files are skipped by name.
# Then it checks its own output and fails if anything that is not the app got
# through. Runs the same on the GitHub runner and in Git Bash on a laptop.
set -euo pipefail

OUT=${1:?usage: build-site.sh <out-dir> [tools|locus]}
SITE=${2:-tools}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
cd "$ROOT"

# 1. What the live sites really serve to browsers.
ROOT_FILES=(
  index.html 404.html favicon.ico favicon.png mobius.css sheet.css sheet.js
  tiktokQpOwCauPh3fK5hvRIsbCl3ni8M1JVEY7.txt
  account-health/index.html
)
FOLDERS=(
  profit angles onboard yourads brand privacy legal roas-calculator
  hq ledger supply ask icons logo oauth pulse 2026-q4-playbook
)
# profit/v5 and profit/v5-next ride along inside profit/.

# 2. File types a browser loads.
KEEP_EXT='html|css|js|json|svg|png|jpg|jpeg|webp|gif|ico|woff|woff2|webmanifest|mp4|webm|pdf|txt|xml'

# 3. Never, wherever they sit.
SKIP_DIRS='worker|engine|hub|slack|db|scripts|source|plans|client-reports|docs|memory|notes|tests?|__tests__|migrations|__pycache__|node_modules'
SKIP_FILES='\.src\.js$|(^|/)package[^/]*\.json$|(^|/)tsconfig[^/]*\.json$|(^|/)wrangler[^/]*$|(^|/)CLAUDE[^/]*$|(^|/)\.[^/]+$|\.test\.js$|\.spec\.js$'

rm -rf "$OUT"
mkdir -p "$OUT"

for f in "${ROOT_FILES[@]}"; do
  [ -f "$f" ] || { echo "Missing root file: $f" >&2; exit 1; }
  mkdir -p "$OUT/$(dirname "$f")"
  cp "$f" "$OUT/$f"
done

git ls-files -z -- "${FOLDERS[@]}" \
  | grep -ziE "\.($KEEP_EXT)\$" \
  | grep -zvE "(^|/)($SKIP_DIRS)/" \
  | grep -zvE "$SKIP_FILES" \
  | xargs -0 cp --parents -t "$OUT"

cp "$HERE/_headers" "$OUT/_headers"

if [ "$SITE" = "locus" ]; then
  # Same four lines publish-locus.yml writes today: the Locus address opens Locus.
  cat > "$OUT/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>Locus</title>
<meta http-equiv="refresh" content="0; url=/profit/">
<script>location.replace('/profit/' + location.search + location.hash);</script>
<a href="/profit/">Open Locus</a>
HTML
fi

# Check the result. Anything here means the lists above are wrong: stop.
bad=$(find "$OUT" -type f \( \
    -path '*/docs/*' -o -path '*/worker/*' -o -path '*/memory/*' -o -path '*/migrations/*' \
    -o -path '*/.github/*' -o -path '*/.claude/*' -o -path '*/tests/*' -o -path '*/test/*' \
    -o -name '*.md' -o -name '*.toml' -o -name '*.sql' -o -name '*.py' -o -name '*.mjs' \
    -o -name '*.cjs' -o -name '*.sh' -o -name '*.ps1' -o -name '.env*' -o -name '.dev.vars' \
    -o -name 'CLAUDE*' -o -name 'wrangler*' -o -name 'CNAME' \) | head -20)
if [ -n "$bad" ]; then echo "Blocked files:" >&2; echo "$bad" >&2; exit 1; fi

for must in index.html 404.html profit/index.html profit/r.html angles/app.js _headers; do
  [ -f "$OUT/$must" ] || { echo "Missing from the build: $must" >&2; exit 1; }
done

n=$(find "$OUT" -type f | wc -l)
echo "$SITE site: $n files"
[ "$n" -gt 300 ] && [ "$n" -lt 8000 ] || { echo "File count $n is outside 300 to 8000" >&2; exit 1; }
big=$(find "$OUT" -type f -size +25M | head -5)
[ -z "$big" ] || { echo "Over Cloudflare's 25 MB a file limit:" >&2; echo "$big" >&2; exit 1; }
