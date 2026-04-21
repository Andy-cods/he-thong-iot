#!/usr/bin/env bash
# V1.7 BOM-Centric Workspace smoke test (extends V1.6)
# Usage: bash tests/smoke/v1.7-smoke.sh [BASE_URL] [USER] [PASS]
# Default: https://mes.songchau.vn · admin · ChangeMe!234
#
# V1.7 changes vs V1.6:
# - /bom/[id] giờ redirect 307 sang /bom/[id]/grid (Excel-style default)
# - /bom/[id]/tree NEW sub-route (tree view retained)
# - Grid: recursive flatten + Inter+Mono font + Undo fix

set -uo pipefail

BASE_URL="${1:-https://mes.songchau.vn}"
USER_NAME="${2:-admin}"
USER_PASS="${3:-ChangeMe!234}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

PASS=0
FAIL=0
TOTAL=0

echo "=== V1.7 Smoke Test @ $BASE_URL ==="
echo

expect() {
  local name="$1"; local expected="$2"; local actual="$3"
  TOTAL=$((TOTAL+1))
  if [[ "$actual" == "$expected" ]]; then
    echo "✅ $name: $actual"; PASS=$((PASS+1))
  else
    echo "❌ $name: got $actual, expected $expected"; FAIL=$((FAIL+1))
  fi
}

expect_body() {
  local name="$1"; local body="$2"; local needle="$3"
  TOTAL=$((TOTAL+1))
  if echo "$body" | grep -qF "$needle"; then
    echo "✅ $name: contains '$needle'"; PASS=$((PASS+1))
  else
    echo "❌ $name: missing '$needle'"; FAIL=$((FAIL+1))
  fi
}

status() { curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$@"; }
body() { curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$@"; }

echo "--- 1. Health + Auth ---"
expect "GET /api/health" "200" "$(status "$BASE_URL/api/health")"
LOGIN_RES=$(curl -s -w '\n%{http_code}' -c "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -X POST "$BASE_URL/api/auth/login" \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$USER_PASS\"}")
expect "POST /api/auth/login" "200" "$(echo "$LOGIN_RES" | tail -1)"
expect "GET /api/me" "200" "$(status "$BASE_URL/api/me")"

echo
echo "--- 2. BOM workspace (V1.7 Grid default) ---"
BOM_LIST=$(body "$BASE_URL/api/bom/templates?pageSize=1")
BOM_ID=$(echo "$BOM_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'] if d.get('data') else '')" 2>/dev/null || echo "")

if [[ -z "$BOM_ID" ]]; then
  echo "⚠️  Không tìm thấy BOM — bỏ qua workspace tests"
else
  echo "ℹ️  BOM ID: $BOM_ID"
  expect "GET /api/bom/templates/[id]" "200" "$(status "$BASE_URL/api/bom/templates/$BOM_ID")"
  expect "GET /api/bom/templates/[id]/summary" "200" "$(status "$BASE_URL/api/bom/templates/$BOM_ID/summary")"

  SUMMARY=$(body "$BASE_URL/api/bom/templates/$BOM_ID/summary")
  for key in "ordersTotal" "ordersActive" "workOrdersActive" "shortageComponents" "ecoTotal" "ecoActive" "lineCount"; do
    expect_body "summary.$key" "$SUMMARY" "\"$key\""
  done

  echo
  echo "--- 3. V1.7 Grid-as-default routing ---"
  # /bom/[id] now 307 redirect → /grid
  expect "GET /bom/[id] (V1.7 redirect 307)" "307" "$(status "$BASE_URL/bom/$BOM_ID")"
  # Follow redirect lands on grid
  FINAL_URL=$(curl -sL -b "$COOKIE_JAR" -c "$COOKIE_JAR" -o /dev/null -w '%{url_effective}' "$BASE_URL/bom/$BOM_ID")
  expect "Follow /bom/[id] → /grid" "$BASE_URL/bom/$BOM_ID/grid" "$FINAL_URL"
  # Grid + tree vẫn 200
  expect "GET /bom/[id]/grid (default)" "200" "$(status "$BASE_URL/bom/$BOM_ID/grid")"
  expect "GET /bom/[id]/tree (V1.7 NEW)" "200" "$(status "$BASE_URL/bom/$BOM_ID/tree")"
  # V1.7-beta — 7 sub-route redirect 307 sang /grid?panel=X (back-compat bookmark)
  expect "GET /bom/[id]/orders (V1.7-beta 307)" "307" "$(status "$BASE_URL/bom/$BOM_ID/orders")"
  expect "GET /bom/[id]/work-orders (V1.7-beta 307)" "307" "$(status "$BASE_URL/bom/$BOM_ID/work-orders")"
  expect "GET /bom/[id]/procurement (V1.7-beta 307)" "307" "$(status "$BASE_URL/bom/$BOM_ID/procurement")"
  expect "GET /bom/[id]/shortage (V1.7-beta 307)" "307" "$(status "$BASE_URL/bom/$BOM_ID/shortage")"
  expect "GET /bom/[id]/eco (V1.7-beta 307)" "307" "$(status "$BASE_URL/bom/$BOM_ID/eco")"
  expect "GET /bom/[id]/assembly (V1.7-beta 307)" "307" "$(status "$BASE_URL/bom/$BOM_ID/assembly")"
  expect "GET /bom/[id]/history (V1.7-beta 307)" "307" "$(status "$BASE_URL/bom/$BOM_ID/history")"
  # V1.7-beta — grid với panel query params (target redirect)
  expect "GET /bom/[id]/grid?panel=orders" "200" "$(status "$BASE_URL/bom/$BOM_ID/grid?panel=orders&autoOpen=1")"
  expect "GET /bom/[id]/grid?drawer=history" "200" "$(status "$BASE_URL/bom/$BOM_ID/grid?drawer=history")"

  echo
  echo "--- 4. Global filter API ?bomTemplateId ---"
  expect "GET /api/orders?bomTemplateId" "200" "$(status "$BASE_URL/api/orders?bomTemplateId=$BOM_ID")"
  expect "GET /api/work-orders?bomTemplateId" "200" "$(status "$BASE_URL/api/work-orders?bomTemplateId=$BOM_ID")"
  expect "GET /api/shortage?bomTemplateId" "200" "$(status "$BASE_URL/api/shortage?bomTemplateId=$BOM_ID")"
  expect "GET /api/eco?bomTemplateId" "200" "$(status "$BASE_URL/api/eco?bomTemplateId=$BOM_ID")"

  echo
  echo "--- 5. Global pages với chip filter ---"
  expect "GET /orders?bomTemplateId" "200" "$(status "$BASE_URL/orders?bomTemplateId=$BOM_ID")"
  expect "GET /work-orders?bomTemplateId" "200" "$(status "$BASE_URL/work-orders?bomTemplateId=$BOM_ID")"
  expect "GET /shortage?bomTemplateId" "200" "$(status "$BASE_URL/shortage?bomTemplateId=$BOM_ID")"
  expect "GET /eco?bomTemplateId" "200" "$(status "$BASE_URL/eco?bomTemplateId=$BOM_ID")"
fi

echo
echo "--- 6. Core pages ---"
expect "GET /" "200" "$(status "$BASE_URL/")"
expect "GET /items" "200" "$(status "$BASE_URL/items")"
expect "GET /orders" "200" "$(status "$BASE_URL/orders")"
expect "GET /work-orders" "200" "$(status "$BASE_URL/work-orders")"
expect "GET /shortage" "200" "$(status "$BASE_URL/shortage")"
expect "GET /eco" "200" "$(status "$BASE_URL/eco")"
expect "GET /suppliers" "200" "$(status "$BASE_URL/suppliers")"
expect "GET /product-lines" "200" "$(status "$BASE_URL/product-lines")"
expect "GET /admin" "200" "$(status "$BASE_URL/admin")"
expect "GET /bom (list)" "200" "$(status "$BASE_URL/bom")"

echo
echo "=== SUMMARY ==="
echo "Total: $TOTAL · Pass: $PASS · Fail: $FAIL"
[[ "$FAIL" -eq 0 ]] && echo "🎉 ALL PASS" && exit 0 || echo "❌ $FAIL test(s) failed" && exit 1
