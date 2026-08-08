#!/bin/sh
# Waits until RestTimer.tsx has gone 90s without changing (a concurrent autofix
# worker is rewriting it), then exits. Temporary; delete after use.
cd "$(dirname "$0")" || exit 1
prev=""
stable=0
i=0
while [ "$i" -lt 60 ]; do
  i=$((i + 1))
  cur=$(md5sum src/components/RestTimer.tsx | cut -d' ' -f1)
  if [ "$cur" = "$prev" ]; then
    stable=$((stable + 1))
  else
    stable=0
  fi
  prev=$cur
  if [ "$stable" -ge 9 ]; then
    echo "SETTLED after $i checks"
    exit 0
  fi
  sleep 10
done
echo "STILL CHANGING after $i checks"
