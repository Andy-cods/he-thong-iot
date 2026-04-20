#!/usr/bin/env bash
# V1.6 BOM-Centric Workspace smoke test
# Usage: bash tests/smoke/v1.6-smoke.sh [BASE_URL] [USER] [PASS]
# Default: https://mes.songchau.vn · admin · ChangeMe!234

set -uo pipefail

BASE_URL="${1:-https://mes.songchau.vn}"
USER_NAME="${2:-admin}"
USER_PASS="${3:-ChangeMe!234}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

PASS=0
FAIL=0
TOTAL=0

echo "=== V1.6 Smoke Test @ $BASE_URL ==="
echo

# Helper: expect status code
expect() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  local detail="${4:-}"
  TOTAL=$((TOTAL+1))
  if [[ "$actual" == "$expected" ]]; then
    echo "✅ $name: $actual"
    PASS=$((PASS+1))
  else
    echo "❌ $name: got $actual, expected $expected${detail:+ ($detail)}"
    FAIL=$((FAIL+1))
  fi
}

# Helper: expect body contains
expect_body() {
  local name="$1"
  local body="$2"
  local needle="$3"
  TOTAL=$((TOTAL+1))
  if echo "$body" | grep -qF "$needle"; then
    echo "✅ $name: contains '$needle'"
    PASS=$((PASS+1))
  else
    echo "❌ $name: missing '$needle'"
    FAIL=$((FAIL+1))
  fi
}

# Helper: get status
status() {
  curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$@"
}
# Helper: get body
body() {
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$@"
}

echo "--- 1. Health ---"
expect "GET /api/health" "200" "$(status "$BASE_URL/api/health")"

echo
echo "--- 2. Auth flow ---"
LOGIN_RES=$(curl -s -w '\n%{http_code}' -c "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -X POST "$BASE_URL/api/auth/login" \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$USER_PASS\"}")
LOGIN_STATUS=$(echo "$LOGIN_RES" | tail -1)
expect "POST /api/auth/login" "200" "$LOGIN_STATUS"
expect "GET /api/me (cookie)" "200" "$(status "$BASE_URL/api/me")"

# BOM list — get first BOM ID để test workspace
echo
echo "--- 3. BOM workspace ---"
BOM_LIST=$(body "$BASE_URL/api/bom/templates?pageSize=1")
BOM_ID=$(echo "$BOM_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'] if d.get('data') else '')" 2>/dev/null || echo "")

if [[ -z "$BOM_ID" ]]; then
  echo "⚠️  Không tìm thấy BOM nào — bỏ qua workspace tests"
else
  echo "ℹ️  Test với BOM ID: $BOM_ID"
  expect "GET /api/bom/templates/[id]" "200" "$(status "$BASE_URL/api/bom/templates/$BOM_ID")"
  expect "GET /api/bom/templates/[id]/summary (V1.6 new)" "200" "$(status "$BASE_URL/api/bom/templates/$BOM_ID/summary")"

  # Verify summary shape
  SUMMARY=$(body "$BASE_URL/api/bom/templates/$BOM_ID/summary")
  for key in "ordersTotal" "ordersActive" "workOrdersActive" "shortageComponents" "ecoTotal" "ecoActive" "lineCount"; do
    expect_body "summary.$key" "$SUMMARY" "\"$key\""
  done

  echo
  echo "--- 4. Workspace sub-routes render ---"
  expect "GET /bom (list)" "200" "$(status "$BASE_URL/bom")"
  expect "GET /bom/[id] (detail)" "200" "$(status "$BASE_URL/bom/$BOM_ID")"
  expect "GET /bom/[id]/orders (sub-route)" "200" "$(status "$BASE_URL/bom/$BOM_ID/orders")"
  expect "GET /bom/[id]/work-orders" "200" "$(status "$BASE_URL/bom/$BOM_ID/work-orders")"
  expect "GET /bom/[id]/procurement" "200" "$(status "$BASE_URL/bom/$BOM_ID/procurement")"
  expect "GET /bom/[id]/shortage" "200" "$(status "$BASE_URL/bom/$BOM_ID/shortage")"
  expect "GET /bom/[id]/eco" "200" "$(status "$BASE_URL/bom/$BOM_ID/eco")"
  expect "GET /bom/[id]/assembly" "200" "$(status "$BASE_URL/bom/$BOM_ID/assembly")"
  expect "GET /bom/[id]/history" "200" "$(status "$BASE_URL/bom/$BOM_ID/history")"
  expect "GET /bom/[id]/grid" "200" "$(status "$BASE_URL/bom/$BOM_ID/grid")"

  echo
  echo "--- 5. Global filter ?bomTemplateId=X ---"
  expect "GET /api/orders?bomTemplateId" "200" "$(status "$BASE_URL/api/orders?bomTemplateId=$BOM_ID")"
  expect "GET /api/work-orders?bomTemplateId" "200" "$(status "$BASE_URL/api/work-orders?bomTemplateId=$BOM_ID")"
  expect "GET /api/shortage?bomTemplateId" "200" "$(status "$BASE_URL/api/shortage?bomTemplateId=$BOM_ID")"
  expect "GET /api/eco?bomTemplateId" "200" "$(status "$BASE_URL/api/eco?bomTemplateId=$BOM_ID")"

  echo
  echo "--- 6. Global pages với chip filter ---"
  expect "GET /orders?bomTemplateId" "200" "$(status "$BASE_URL/orders?bomTemplateId=$BOM_ID")"
  expect "GET /work-orders?bomTemplateId" "200" "$(status "$BASE_URL/work-orders?bomTemplateId=$BOM_ID")"
  expect "GET /shortage?bomTemplateId" "200" "$(status "$BASE_URL/shortage?bomTemplateId=$BOM_ID")"
  expect "GET /eco?bomTemplateId" "200" "$(status "$BASE_URL/eco?bomTemplateId=$BOM_ID")"
fi

echo
echo "--- 7. Core pages (không regression) ---"
expect "GET / (dashboard)" "200" "$(status "$BASE_URL/")"
expect "GET /items" "200" "$(status "$BASE_URL/items")"
expect "GET /orders (global)" "200" "$(status "$BASE_URL/orders")"
expect "GET /work-orders (global)" "200" "$(status "$BASE_URL/work-orders")"
expect "GET /shortage (global)" "200" "$(status "$BASE_URL/shortage")"
expect "GET /eco (global)" "200" "$(status "$BASE_URL/eco")"
expect "GET /suppliers" "200" "$(status "$BASE_URL/suppliers")"
expect "GET /product-lines" "200" "$(status "$BASE_URL/product-lines")"
expect "GET /admin" "200" "$(status "$BASE_URL/admin")"

echo
echo "=== SUMMARY ==="
echo "Total: $TOTAL · Pass: $PASS · Fail: $FAIL"
[[ "$FAIL" -eq 0 ]] && echo "🎉 ALL PASS" && exit 0 || echo "❌ $FAIL test(s) failed" && exit 1
