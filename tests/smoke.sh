#!/usr/bin/env bash
# =============================================================================
# smoke.sh — ABOL.ai minimal regression runner
# =============================================================================
# What this does, in order:
#   1. Python syntax check for every module the container ships
#   2. Demo PDF regression (generate_report.py --demo produces a 43-page PDF)
#   3. external_benchmarks coverage: 21 sector x pillar peer medians present
#   4. RLS regression: anon locked out of abol_assessments, can read view,
#      cannot flip is_paid (3 curl assertions against live Supabase)
#   5. server.py imports (FastAPI wiring compiles)
#   6. (optional) POST /generate against a live Fly.io deploy if FLY_URL is set
#
# Usage:
#   cd abol && bash tests/smoke.sh
#
# Environment:
#   SUPABASE_ANON_KEY     required for RLS assertions (public, in app.html)
#   FLY_URL               optional, e.g. https://abol-pdf.fly.dev
#   TEST_UUID             optional, real completed assessment UUID for /generate test
#
# Exit codes:
#   0 — all checks passed
#   1 — any check failed (stderr has the details)
# =============================================================================

set -e

cd "$(dirname "$0")/.."

FAIL=0
PASS=0

say() { printf "%-60s %s\n" "$1" "$2"; }
pass() { PASS=$((PASS+1)); say "$1" "OK"; }
fail() { FAIL=$((FAIL+1)); say "$1" "FAIL ($2)"; }

# ----------------------------------------------------------------------------
# 1. Python syntax
# ----------------------------------------------------------------------------
python -m py_compile \
    main.py generate_report.py report_design.py report_charts.py \
    report_sections.py report_llm.py external_benchmarks.py \
    report_loaders.py server.py \
    && pass "py_compile (9 modules)" \
    || fail "py_compile" "one or more modules failed to compile"

# ----------------------------------------------------------------------------
# 2. Demo PDF regression
# ----------------------------------------------------------------------------
rm -f reports/abol_report_demo_*.pdf 2>/dev/null || true
if python generate_report.py --demo >/dev/null 2>&1; then
    LATEST=$(ls -t reports/abol_report_demo_*.pdf 2>/dev/null | head -1)
    if [ -z "$LATEST" ]; then
        fail "demo PDF regression" "no output file produced"
    else
        SIZE=$(stat -c '%s' "$LATEST" 2>/dev/null || stat -f '%z' "$LATEST" 2>/dev/null)
        # 43-page PDF typical size is 180-220 KB
        if [ "$SIZE" -gt 150000 ] && [ "$SIZE" -lt 300000 ]; then
            pass "demo PDF regression (~${SIZE} bytes)"
        else
            fail "demo PDF regression" "size ${SIZE} outside 150-300 KB window"
        fi
    fi
else
    fail "demo PDF regression" "generate_report.py --demo errored"
fi

# ----------------------------------------------------------------------------
# 3. external_benchmarks coverage: every (sector, pillar) returns data
# ----------------------------------------------------------------------------
if python -c "
import external_benchmarks as e
failures = []
for s in ['smb', 'corporate', 'financial_services']:
    for p in ['readiness','security_measures','dependencies','investment','compliance','governance','resilience']:
        peer = e.get_peer_median(s, p)
        if peer['median'] is None:
            failures.append(f'{s}/{p}')
        if not (0 <= peer['p25'] < peer['median'] < peer['p75'] <= 100):
            failures.append(f'{s}/{p}: ordering')
assert e.get_peer_median('unknown','readiness')['source'] == 'data_pending'
if failures:
    print('FAIL:', failures); exit(1)
" 2>/dev/null; then
    pass "external_benchmarks 21 sector x pillar combos"
else
    fail "external_benchmarks" "see stderr"
fi

# ----------------------------------------------------------------------------
# 4. RLS regression assertions (live Supabase)
# ----------------------------------------------------------------------------
SUPA_URL="https://cnoudltgcxeyzfelvbuv.supabase.co"
ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNub3VkbHRnY3hleXpmZWx2YnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzI3ODEsImV4cCI6MjA4ODgwODc4MX0.QJ_mtGnOBKpMSG34-SA6luuneLv9lV6h0s3gXElOkJY}"

# 4a. anon cannot SELECT abol_assessments
RESP=$(curl -s "$SUPA_URL/rest/v1/abol_assessments?select=email&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
if echo "$RESP" | grep -q "permission denied"; then
    pass "RLS: anon blocked on abol_assessments SELECT"
else
    fail "RLS: anon SELECT" "unexpected response: $(echo "$RESP" | head -c 120)"
fi

# 4b. anon CAN SELECT abol_public_scores view
RESP=$(curl -s "$SUPA_URL/rest/v1/abol_public_scores?select=overall_rating&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
if echo "$RESP" | grep -q "overall_rating"; then
    pass "RLS: anon allowed on abol_public_scores view"
else
    fail "RLS: view SELECT" "unexpected response: $(echo "$RESP" | head -c 120)"
fi

# 4c. anon cannot flip is_paid
FAKE_UUID="00000000-0000-0000-0000-000000000001"
RESP=$(curl -s -X PATCH "$SUPA_URL/rest/v1/abol_assessments?id=eq.$FAKE_UUID" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"is_paid":true}')
if echo "$RESP" | grep -q "permission denied"; then
    pass "RLS: anon blocked from is_paid flip"
else
    fail "RLS: is_paid flip" "unexpected response: $(echo "$RESP" | head -c 120)"
fi

# 4d. anon cannot SELECT pdf_generations
RESP=$(curl -s "$SUPA_URL/rest/v1/pdf_generations?select=id&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
if echo "$RESP" | grep -q "permission denied"; then
    pass "RLS: anon blocked on pdf_generations SELECT"
else
    fail "RLS: pdf_generations" "unexpected response: $(echo "$RESP" | head -c 120)"
fi

# ----------------------------------------------------------------------------
# 5. server.py imports cleanly (container wiring)
# ----------------------------------------------------------------------------
if python -c "
import os
os.environ['SUPABASE_URL'] = 'https://example.invalid'
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = 'bogus'
# Block startup asserts by stubbing httpx.Client.get
import httpx
_orig = httpx.Client
class _StubClient:
    def __init__(self, **kwargs): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def get(self, *args, **kwargs):
        class R:
            status_code = 200
            def raise_for_status(self): pass
            def json(self): return []
        return R()
httpx.Client = _StubClient
try:
    import server
    assert hasattr(server, 'app')
finally:
    httpx.Client = _orig
" 2>/dev/null; then
    pass "server.py FastAPI app wiring"
else
    fail "server.py import" "FastAPI app failed to construct"
fi

# ----------------------------------------------------------------------------
# 6. Optional: live Fly.io check
# ----------------------------------------------------------------------------
if [ -n "${FLY_URL:-}" ]; then
    if curl -s -f "${FLY_URL}/health" >/dev/null 2>&1; then
        pass "Fly.io /health (${FLY_URL})"
    else
        fail "Fly.io /health" "${FLY_URL} not reachable"
    fi
    if [ -n "${TEST_UUID:-}" ]; then
        CODE=$(curl -s -o /tmp/fly-smoke.pdf -w "%{http_code}" \
            -X POST "${FLY_URL}/generate?uuid=${TEST_UUID}")
        SIZE=$(stat -c '%s' /tmp/fly-smoke.pdf 2>/dev/null || stat -f '%z' /tmp/fly-smoke.pdf 2>/dev/null || echo 0)
        if [ "$CODE" = "200" ] && [ "$SIZE" -gt 150000 ]; then
            pass "Fly.io /generate live PDF (${SIZE} bytes)"
        else
            fail "Fly.io /generate" "HTTP $CODE, $SIZE bytes"
        fi
    fi
fi

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
echo ""
echo "---"
echo "PASS: $PASS    FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
    echo "smoke.sh FAILED"
    exit 1
fi
echo "smoke.sh passed"
exit 0
