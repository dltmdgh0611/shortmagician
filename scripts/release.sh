#!/bin/bash
# ====================================================
# ShortMagician Release Script
# Usage: bash scripts/release.sh <version>
# Example: bash scripts/release.sh 0.2.0
# ====================================================
# Prerequisites:
#   1. gh CLI authenticated
#   2. Signing key at ~/.tauri/shortmagician2.key
#   3. TAURI_KEY_PASSWORD env var set
#   4. backend.exe built and in src-tauri/resources/
#   5. Secrets embedded (py -3 scripts/embed_secrets.py)
# ====================================================

set -e

VERSION="${1:?Usage: bash scripts/release.sh <version>}"
GIST_ID="d5b9c835e537ecef12fea82115d70ddb"
REPO="dltmdgh0611/shortmagician"

echo "=== ShortMagician Release v${VERSION} ==="

# Step 1: Build signed NSIS installer
echo "[1/5] Building signed NSIS installer..."
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/shortmagician2.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_KEY_PASSWORD:?Set TAURI_KEY_PASSWORD env var}"
npx.cmd tauri build

# Step 2: Read the signature
echo "[2/5] Reading signature..."
SIG_FILE="src-tauri/target/release/bundle/nsis/shortmagician_${VERSION}_x64-setup.exe.sig"
EXE_FILE="src-tauri/target/release/bundle/nsis/shortmagician_${VERSION}_x64-setup.exe"

if [ ! -f "$SIG_FILE" ]; then
    echo "ERROR: Signature file not found: $SIG_FILE"
    exit 1
fi
SIGNATURE=$(cat "$SIG_FILE")

# Step 3: Create GitHub Release
echo "[3/5] Creating GitHub Release v${VERSION}..."
gh release create "v${VERSION}" \
    "$EXE_FILE" \
    "$SIG_FILE" \
    --title "ShortMagician v${VERSION}" \
    --notes "ShortMagician v${VERSION}" \
    --repo "$REPO"

# Step 4: Get the asset ID for the .exe
echo "[4/5] Getting asset ID..."
ASSET_ID=$(gh api "repos/${REPO}/releases/tags/v${VERSION}" \
    --jq ".assets[] | select(.name == \"shortmagician_${VERSION}_x64-setup.exe\") | .id")

if [ -z "$ASSET_ID" ]; then
    echo "ERROR: Could not find asset ID for the installer"
    exit 1
fi
echo "Asset ID: $ASSET_ID"

# Step 5: Update Gist with new latest.json
echo "[5/5] Updating latest.json Gist..."
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

LATEST_JSON=$(cat <<EOF
{
  "version": "${VERSION}",
  "notes": "ShortMagician v${VERSION}",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "windows-x86_64": {
      "signature": "${SIGNATURE}",
      "url": "https://api.github.com/repos/${REPO}/releases/assets/${ASSET_ID}"
    }
  }
}
EOF
)

# Escape for JSON
ESCAPED=$(echo "$LATEST_JSON" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null \
    || echo "$LATEST_JSON" | py -3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

gh api --method PATCH "gists/${GIST_ID}" --input - <<APIEOF
{
  "files": {
    "latest.json": {
      "content": $ESCAPED
    }
  }
}
APIEOF

echo ""
echo "=== Release v${VERSION} complete! ==="
echo "GitHub Release: https://github.com/${REPO}/releases/tag/v${VERSION}"
echo "Updater Gist:   https://gist.github.com/dltmdgh0611/${GIST_ID}"
echo ""
echo "NOTE: GitHub CDN may cache the Gist for ~5 minutes before users see the update."
