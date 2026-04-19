#!/usr/bin/env bash
# =============================================================
# V1.4 Phase B — smoke test 40-cell RBAC matrix via curl.
# =============================================================
# Mục đích: gọi 1 endpoint đại diện cho mỗi (role × entity) và kiểm
# HTTP status. Expected 200/201/404 (pass RBAC) hoặc 403 (deny).
#
# Cách dùng:
#   BASE_URL=https://mes.songchau.vn bash tests/rbac/smoke.sh
#
# Prereq: 4 user test tồn tại trong DB
#   admin_test / planner_test / operator_test / warehouse_test
#   (password chung: Smoke!234).
# Nếu prod thì tạo trước khi chạy, hoặc chỉ chạy trên staging.
# =============================================================
set -u

BASE_URL="${BASE_URL:-http://localhost:3001}"
PASS="${SMOKE_PASS:-Smoke!234}"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

PASS_COUNT=0
FAIL_COUNT=0
TOTAL=0

log() { echo -e "[smoke] $*" >&2; }

login_as() {
  local user="$1"
  local cookie="$TMPDIR/cookie_$user.txt"
  curl -s -c "$cookie" -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$user\",\"password\":\"$PASS\"}" \
    -o /dev/null
  echo "$cookie"
}

# check <role> <method> <path> <expected_status_range> <label>
check() {
  local role="$1"; local method="$2"; local path="$3"
  local expected="$4"; local label="$5"
  local cookie="$TMPDIR/cookie_${role}_test.txt"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -b "$cookie" \
    -X "$method" "$BASE_URL$path" -H 'Content-Type: application/json')
  TOTAL=$((TOTAL+1))
  if [[ "$expected" == *"$status"* ]]; then
    PASS_COUNT=$((PASS_COUNT+1))
    log "  PASS  $role  $method  $path  → $status  ($label)"
  else
    FAIL_COUNT=$((FAIL_COUNT+1))
    log "  FAIL  $role  $method  $path  → $status (expected $expected)  ($label)"
  fi
}

log "Base URL: $BASE_URL"
log "Đăng nhập 4 role..."
login_as admin_test
login_as planner_test
login_as operator_test
login_as warehouse_test

log "=== 10 entity × 4 role = 40 cell ==="

# --- item ---
check admin     GET  /api/items            "200" "admin đọc item"
check planner   GET  /api/items            "200" "planner đọc item"
check operator  GET  /api/items            "200" "operator đọc item"
check warehouse GET  /api/items            "200" "warehouse đọc item"

# --- supplier ---
check admin     GET  /api/suppliers        "200" "admin đọc supplier"
check planner   GET  /api/suppliers        "200" "planner đọc supplier"
check operator  GET  /api/suppliers        "403" "operator KHÔNG đọc supplier"
check warehouse GET  /api/suppliers        "200" "warehouse đọc supplier"

# --- bom_template ---
check admin     GET  /api/bom/templates    "200" "admin đọc BOM"
check planner   GET  /api/bom/templates    "200" "planner đọc BOM"
check operator  GET  /api/bom/templates    "200" "operator đọc BOM"
check warehouse GET  /api/bom/templates    "200" "warehouse đọc BOM"

# --- sales_order ---
check admin     GET  /api/orders           "200" "admin đọc order"
check planner   GET  /api/orders           "200" "planner đọc order"
check operator  GET  /api/orders           "200" "operator đọc order"
check warehouse GET  /api/orders           "200" "warehouse đọc order"

# --- pr (purchase_request) ---
check admin     GET  /api/purchase-requests   "200" "admin đọc PR"
check planner   GET  /api/purchase-requests   "200" "planner đọc PR"
check operator  GET  /api/purchase-requests   "200" "operator đọc PR"
check warehouse GET  /api/purchase-requests   "200" "warehouse đọc PR"

# --- po (purchase_order) ---
check admin     GET  /api/purchase-orders     "200" "admin đọc PO"
check planner   GET  /api/purchase-orders     "200" "planner đọc PO"
check operator  GET  /api/purchase-orders     "200" "operator đọc PO"
check warehouse GET  /api/purchase-orders     "200" "warehouse đọc PO"

# --- wo ---
check admin     GET  /api/work-orders         "200" "admin đọc WO"
check planner   GET  /api/work-orders         "200" "planner đọc WO"
check operator  GET  /api/work-orders         "200" "operator đọc WO"
check warehouse GET  /api/work-orders         "200" "warehouse đọc WO"

# --- eco ---
check admin     GET  /api/eco                 "200" "admin đọc ECO"
check planner   GET  /api/eco                 "200" "planner đọc ECO"
check operator  GET  /api/eco                 "200" "operator đọc ECO"
check warehouse GET  /api/eco                 "200" "warehouse đọc ECO"

# --- audit ---
check admin     GET  /api/admin/audit         "200" "admin đọc audit"
check planner   GET  /api/admin/audit         "200" "planner đọc audit"
check operator  GET  /api/admin/audit         "200" "operator đọc audit"
check warehouse GET  /api/admin/audit         "200" "warehouse đọc audit"

# --- user (admin only create/update/delete; other chỉ read) ---
check admin     GET  /api/admin/users         "200" "admin đọc user"
check planner   GET  /api/admin/users         "200" "planner đọc user"
check operator  GET  /api/admin/users         "200" "operator đọc user"
check warehouse GET  /api/admin/users         "200" "warehouse đọc user"

log "==============================="
log "Total: $TOTAL  Pass: $PASS_COUNT  Fail: $FAIL_COUNT"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
