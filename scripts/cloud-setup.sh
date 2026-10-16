#!/bin/bash
# Setup script for Dendro cloud sessions (Claude Code on the web).
# Paste it into the "Setup script" field of the cloud environment. It runs as
# root on Ubuntu 24.04 before Claude Code starts, and the result is cached.
set -euo pipefail

# The pipeline runs TypeScript through the type stripping of Node 24. The base
# image has Node 20 to 22 only, so install Node 24 from nodejs.org.
if ! node --version 2>/dev/null | grep -q '^v2[4-9]\.'; then
  base=https://nodejs.org/dist/latest-v24.x
  sums=$(curl -fsSL "$base/SHASUMS256.txt")
  file=$(grep -o 'node-v24\.[0-9.]*-linux-x64\.tar\.xz' <<<"$sums" | head -n 1)
  curl -fsSL "$base/$file" -o "/tmp/$file"
  (cd /tmp && grep " $file\$" <<<"$sums" | sha256sum -c -)
  rm -rf /opt/node24
  mkdir -p /opt/node24
  tar -xJf "/tmp/$file" -C /opt/node24 --strip-components=1
  rm "/tmp/$file"
  ln -sf /opt/node24/bin/node /opt/node24/bin/npm /opt/node24/bin/npx /usr/local/bin/
  echo 'export PATH=/opt/node24/bin:$PATH' >/etc/profile.d/node24.sh
  echo 'export PATH=/opt/node24/bin:$PATH' >>/etc/bash.bashrc
fi
export PATH=/opt/node24/bin:$PATH
node --version

# The tests and the validator need no packages. Only `cli build` needs sharp and
# the S3 client, so a failed install does not stop the session.
if [ -f package.json ] && grep -q '"name": "dendro"' package.json; then
  npm ci --no-audit --no-fund || echo "npm ci failed; run it in the session if you need cli build"
else
  echo "Not in the Dendro repo root; skipped npm ci"
fi
