"""
Iteration 7 backend tests - public registration, pending gating,
admin user activation & manual balance edit, hot-wallet admin-only,
recovery scan filtering, exchange with from/to_network params.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "psymaks249@gmail.com"
ADMIN_PASSWORD = "FozPay2025Admin!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


@pytest.fixture(scope="module")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("user", {}).get("role") == "admin"
    return data["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Admin login ----------------
def test_admin_login_returns_admin_role():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200
    j = r.json()
    assert "access_token" in j
    assert j["user"]["role"] == "admin"


# ---------------- Public registration -> pending ----------------
@pytest.fixture(scope="module")
def pending_user():
    email = f"test_pending_{uuid.uuid4().hex[:8]}@test.com"
    password = "Test1234!"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": password, "name": "Pending Tester"},
                      timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    j = r.json()
    assert j.get("pending") is True
    assert j["user"]["status"] == "pending"
    return {"email": email, "password": password,
            "user_id": j["user"]["user_id"], "token": j["access_token"]}


def test_registration_marks_user_pending(pending_user):
    assert pending_user["user_id"].startswith("user_")


def test_pending_user_cannot_access_wallet(pending_user):
    headers = {"Authorization": f"Bearer {pending_user['token']}"}
    r = requests.get(f"{API}/wallet", headers=headers, timeout=30)
    assert r.status_code == 403, f"expected 403 for pending user wallet, got {r.status_code} {r.text}"


# ---------------- Admin lists users with status + balances ----------------
def test_admin_users_list_has_status_and_balances(admin_headers, pending_user):
    r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("status") is True
    users = j.get("data", [])
    assert isinstance(users, list) and len(users) > 0
    found = None
    for u in users:
        assert "status" in u, f"user missing status: {u}"
        assert "balances" in u, f"user missing balances: {u}"
        assert isinstance(u["balances"], list)
        if u.get("user_id") == pending_user["user_id"]:
            found = u
    assert found is not None, "pending user not visible in admin list"
    assert found["status"] == "pending"


# ---------------- Admin activates pending user ----------------
def test_admin_activates_pending_user(admin_headers, pending_user):
    uid = pending_user["user_id"]
    r = requests.put(f"{API}/admin/users/{uid}/status",
                     headers=admin_headers, json={"status": "active"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "active"
    # now this user's wallet works
    headers = {"Authorization": f"Bearer {pending_user['token']}"}
    r2 = requests.get(f"{API}/wallet", headers=headers, timeout=30)
    assert r2.status_code == 200, f"activated user wallet: {r2.status_code} {r2.text}"


# ---------------- Admin sets per-currency balance ----------------
def test_admin_set_user_balance_persists(admin_headers, pending_user):
    uid = pending_user["user_id"]
    r = requests.put(f"{API}/admin/users/{uid}/balance",
                     headers=admin_headers,
                     json={"iso": "USDT", "balance": 500}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["data"]["balance"] == 500
    # verify via /api/wallet as that user
    headers = {"Authorization": f"Bearer {pending_user['token']}"}
    r2 = requests.get(f"{API}/wallet", headers=headers, timeout=30)
    assert r2.status_code == 200, r2.text
    wallets = r2.json().get("data", [])
    usdt = [w for w in wallets if (w.get("iso") or "").upper() == "USDT"]
    assert usdt, f"USDT wallet not found in response: {wallets}"
    assert float(usdt[0]["balance"]) == 500.0


# ---------------- Admin-only guard: activated client cannot list admin users ----------------
def test_non_admin_cannot_list_users(pending_user):
    headers = {"Authorization": f"Bearer {pending_user['token']}"}
    r = requests.get(f"{API}/admin/users", headers=headers, timeout=30)
    assert r.status_code == 403, f"expected 403 for non-admin, got {r.status_code}"


def test_non_admin_cannot_get_hot_wallet(pending_user):
    headers = {"Authorization": f"Bearer {pending_user['token']}"}
    r = requests.get(f"{API}/admin/hot-wallet", headers=headers, timeout=30)
    assert r.status_code == 403


# ---------------- Hot wallet (admin) ----------------
def test_hot_wallet_admin_shape(admin_headers):
    r = requests.get(f"{API}/admin/hot-wallet", headers=admin_headers, timeout=90)
    assert r.status_code == 200, r.text
    data = r.json().get("data", {})
    assert "evm_address" in data
    assert "tron_address" in data
    assert isinstance(data.get("balances"), list)
    assert "total_usd" in data


# ---------------- Recovery scan ----------------
def test_recovery_scan_admin(admin_headers):
    r = requests.get(f"{API}/recovery/scan", headers=admin_headers, timeout=120)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "findings" in j
    assert "scanned" in j


def test_recovery_scan_with_address_filter(admin_headers):
    # Use a syntactically valid but unused address — should not 500
    r = requests.get(f"{API}/recovery/scan?address=0x0000000000000000000000000000000000000001",
                     headers=admin_headers, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    scanned = j.get("scanned", {})
    assert scanned.get("evm", 0) == 0
    assert scanned.get("tron", 0) == 0


# ---------------- Exchange graceful 400 ----------------
def test_exchange_no_liquidity_returns_400_not_500(admin_headers):
    # Admin has no on-chain USDT in hot wallet balance (per task note),
    # so this must return either 400 (graceful) or 400 for insufficient funds.
    r = requests.post(f"{API}/wallet/exchange", headers=admin_headers,
                      json={"from_iso": "USDT", "to_iso": "USDC",
                            "amount": 10, "from_network": 2, "to_network": 2}, timeout=60)
    assert r.status_code != 500, f"server 500 on exchange: {r.text}"
    assert r.status_code in (400, 401, 403), f"unexpected status: {r.status_code} {r.text}"


# ---------------- Cleanup pending test user ----------------
def test_zz_cleanup_pending_user(admin_headers, pending_user):
    uid = pending_user["user_id"]
    r = requests.delete(f"{API}/admin/users/{uid}", headers=admin_headers, timeout=30)
    assert r.status_code == 200
