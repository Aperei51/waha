#!/usr/bin/env bash
# Baixa os Informativos mensais de emplacamento da Fenabrave (2003 até jan/2025).
# Uso: ./baixar_pdfs.sh <pasta_destino>
set -euo pipefail
dest="${1:-pdfs}"
mkdir -p "$dest"
for y in $(seq 2003 2025); do
  curl -sS -A "Mozilla/5.0" -X POST -d "ano=$y" https://www.fenabrave.org.br/portalv2/api/Emplacamentos |
    python3 -I -c "import sys,json; [print(b['data'][:7].replace('-','_'), b['link']) for b in json.load(sys.stdin)['data']['blocos']]"
done | awk '!seen[$1]++' | while read -r ym link; do
  [[ "$ym" > "2025_01" ]] && continue
  [ -s "$dest/$ym.pdf" ] || echo "$ym $link"
done | xargs -P 8 -n 2 sh -c 'curl -sS --retry 3 -A "Mozilla/5.0" -o "$0/$1.pdf.part" "https://www.fenabrave.org.br/portal/files/$2" && mv "$0/$1.pdf.part" "$0/$1.pdf"' "$dest"
ls "$dest"/*.pdf | wc -l
