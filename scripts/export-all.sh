#!/usr/bin/env bash
set -Eeuo pipefail
output="${1:-/opt/rice/backups/rice-export-$(date +%Y%m%d%H%M%S).csv}"
mkdir -p "$(dirname "$output")"
curl -fsS http://127.0.0.1:3201/api/exports/readings.csv -o "$output"
printf 'CSV已导出: %s (%s bytes)\n' "$output" "$(wc -c <"$output")"
