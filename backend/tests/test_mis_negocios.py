"""Backend tests for Mis Negocios API - auth, CRUD, isolation, AI."""
import pytest
import requests
from conftest import auth_headers


# ---------- Health ----------
class TestHealth:
    def test_root(self, api, base_url):
        r = api.get(f"{base_url}/api/")
        assert r.status_code == 200
        assert r.json().get("message")


# ---------- Auth ----------
class TestAuth:
    def test_session_invalid(self, api, base_url):
        r = api.post(f"{base_url}/api/auth/session", json={"session_id": "clearly-invalid-xyz"})
        assert r.status_code == 401

    def test_me_without_token(self, api, base_url):
        r = api.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token(self, api, base_url):
        r = api.get(f"{base_url}/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401

    def test_me_valid(self, api, base_url, user_a):
        r = api.get(f"{base_url}/api/auth/me", headers=auth_headers(user_a["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["user_id"] == user_a["user_id"]
        assert data["email"] == user_a["email"]

    def test_logout_clears_session(self, api, base_url, mongo):
        # Create a short-lived session for logout test only
        import uuid, datetime
        user_id = f"user_test_logout_{uuid.uuid4().hex[:6]}"
        token = f"tok_test_logout_{uuid.uuid4().hex}"
        mongo.users.insert_one({
            "user_id": user_id, "email": f"TEST_logout_{uuid.uuid4().hex[:4]}@x.com",
            "name": "lo", "picture": "",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
        mongo.user_sessions.insert_one({
            "session_token": token, "user_id": user_id,
            "expires_at": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1),
            "created_at": datetime.datetime.now(datetime.timezone.utc),
        })
        try:
            # It works before logout
            r = api.get(f"{base_url}/api/auth/me", headers=auth_headers(token))
            assert r.status_code == 200
            r = api.post(f"{base_url}/api/auth/logout", headers=auth_headers(token))
            assert r.status_code == 200
            # After logout
            r = api.get(f"{base_url}/api/auth/me", headers=auth_headers(token))
            assert r.status_code == 401
        finally:
            mongo.user_sessions.delete_many({"user_id": user_id})
            mongo.users.delete_one({"user_id": user_id})


# ---------- Businesses ----------
class TestBusinesses:
    def test_create_list_get(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        r = api.post(f"{base_url}/api/businesses", json={"name": "TEST_Biz_A1", "subtitle": "x"}, headers=h)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["user_id"] == user_a["user_id"]
        assert b["name"] == "TEST_Biz_A1"
        bid = b["id"]
        pytest.biz_a_id = bid

        r = api.get(f"{base_url}/api/businesses", headers=h)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert bid in ids

        r = api.get(f"{base_url}/api/businesses/{bid}", headers=h)
        assert r.status_code == 200
        assert r.json()["id"] == bid

    def test_update(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        r = api.put(f"{base_url}/api/businesses/{bid}",
                    json={"name": "TEST_Biz_A1_upd", "subtitle": "y"}, headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Biz_A1_upd"

    def test_cross_user_isolation(self, api, base_url, user_a, user_b):
        bid = pytest.biz_a_id
        hb = auth_headers(user_b["token"])
        # B lists own businesses: should not include A's
        r = api.get(f"{base_url}/api/businesses", headers=hb)
        assert r.status_code == 200
        assert bid not in [x["id"] for x in r.json()]

        r = api.get(f"{base_url}/api/businesses/{bid}", headers=hb)
        assert r.status_code == 404
        r = api.put(f"{base_url}/api/businesses/{bid}", json={"name": "hack"}, headers=hb)
        assert r.status_code == 404
        r = api.delete(f"{base_url}/api/businesses/{bid}", headers=hb)
        assert r.status_code == 404


# ---------- Products + Stock ----------
class TestProducts:
    def test_create_product(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        payload = {"name": "TEST_Prod1", "unit_cost": 10, "sale_price": 25, "stock": 5, "min_stock": 2}
        r = api.post(f"{base_url}/api/businesses/{bid}/products", json=payload, headers=h)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["business_id"] == bid
        assert p["stock"] == 5
        pytest.prod_a_id = p["id"]

    def test_list_and_get_product(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        pid = pytest.prod_a_id
        r = api.get(f"{base_url}/api/businesses/{bid}/products", headers=h)
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json())

        r = api.get(f"{base_url}/api/businesses/{bid}/products/{pid}", headers=h)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Prod1"

    def test_update_product(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        pid = pytest.prod_a_id
        r = api.put(f"{base_url}/api/businesses/{bid}/products/{pid}",
                    json={"name": "TEST_Prod1_upd", "unit_cost": 10, "sale_price": 30,
                          "stock": 5, "min_stock": 2}, headers=h)
        assert r.status_code == 200
        assert r.json()["sale_price"] == 30

    def test_stock_entry_creates_egreso(self, api, base_url, user_a, mongo):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        pid = pytest.prod_a_id
        # count prior egreso transactions
        prior = mongo.transactions.count_documents({"business_id": bid, "type": "egreso"})
        r = api.post(f"{base_url}/api/businesses/{bid}/stock-entries",
                     json={"product_id": pid, "quantity": 3, "unit_cost": 7.5}, headers=h)
        assert r.status_code == 200, r.text
        # product stock increased from 5 -> 8
        r = api.get(f"{base_url}/api/businesses/{bid}/products/{pid}", headers=h)
        assert r.status_code == 200
        assert r.json()["stock"] == 8
        # new egreso transaction amount == 3*7.5
        txs = list(mongo.transactions.find({"business_id": bid, "type": "egreso"}, {"_id": 0}))
        assert len(txs) == prior + 1
        last = sorted(txs, key=lambda t: t["created_at"])[-1]
        assert abs(last["amount"] - 22.5) < 1e-6

    def test_product_cross_user_isolation(self, api, base_url, user_b):
        hb = auth_headers(user_b["token"])
        bid = pytest.biz_a_id
        pid = pytest.prod_a_id
        r = api.get(f"{base_url}/api/businesses/{bid}/products", headers=hb)
        assert r.status_code == 404
        r = api.get(f"{base_url}/api/businesses/{bid}/products/{pid}", headers=hb)
        assert r.status_code == 404


# ---------- Customers ----------
class TestCustomers:
    def test_create_customer(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        r = api.post(f"{base_url}/api/businesses/{bid}/customers",
                     json={"name": "TEST_Cust1", "phone": "555"}, headers=h)
        assert r.status_code == 200
        c = r.json()
        assert c["business_id"] == bid
        pytest.cust_a_id = c["id"]

    def test_customer_sales_initially_empty(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        cid = pytest.cust_a_id
        r = api.get(f"{base_url}/api/businesses/{bid}/customers/{cid}/sales", headers=h)
        assert r.status_code == 200
        assert r.json() == []


# ---------- Sales ----------
class TestSales:
    def test_empty_items_rejected(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        r = api.post(f"{base_url}/api/businesses/{bid}/sales",
                     json={"items": [], "paid": 0}, headers=h)
        assert r.status_code == 400

    def test_create_sale_and_decrement_stock_and_tx(self, api, base_url, user_a, mongo):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        pid = pytest.prod_a_id
        cid = pytest.cust_a_id
        # product stock currently 8
        prior_ingreso = mongo.transactions.count_documents({"business_id": bid, "type": "ingreso"})
        payload = {
            "customer_id": cid, "customer_name": "TEST_Cust1",
            "items": [{"product_id": pid, "name": "TEST_Prod1_upd",
                       "quantity": 2, "unit_price": 30}],
            "paid": 60.0,
        }
        r = api.post(f"{base_url}/api/businesses/{bid}/sales", json=payload, headers=h)
        assert r.status_code == 200, r.text
        s = r.json()
        assert abs(s["total"] - 60.0) < 1e-6
        # stock decremented 8 -> 6
        r = api.get(f"{base_url}/api/businesses/{bid}/products/{pid}", headers=h)
        assert r.json()["stock"] == 6
        # ingreso tx created
        now_ingreso = mongo.transactions.count_documents({"business_id": bid, "type": "ingreso"})
        assert now_ingreso == prior_ingreso + 1

    def test_customer_sales_lists_only_customer(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        cid = pytest.cust_a_id
        r = api.get(f"{base_url}/api/businesses/{bid}/customers/{cid}/sales", headers=h)
        assert r.status_code == 200
        sales = r.json()
        assert len(sales) >= 1
        for s in sales:
            assert s["customer_id"] == cid

    def test_sale_paid_zero_does_not_create_tx(self, api, base_url, user_a, mongo):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        pid = pytest.prod_a_id
        prior = mongo.transactions.count_documents({"business_id": bid, "type": "ingreso"})
        r = api.post(f"{base_url}/api/businesses/{bid}/sales",
                     json={"items": [{"product_id": pid, "name": "p",
                                      "quantity": 1, "unit_price": 20}], "paid": 0}, headers=h)
        assert r.status_code == 200
        now = mongo.transactions.count_documents({"business_id": bid, "type": "ingreso"})
        assert now == prior  # unchanged


# ---------- Transactions ----------
class TestTransactions:
    def test_invalid_type_400(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        r = api.post(f"{base_url}/api/businesses/{bid}/transactions",
                     json={"type": "bogus", "amount": 10}, headers=h)
        assert r.status_code == 400

    def test_valid_ingreso_and_egreso(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        r = api.post(f"{base_url}/api/businesses/{bid}/transactions",
                     json={"type": "ingreso", "amount": 100, "description": "TEST"}, headers=h)
        assert r.status_code == 200
        assert r.json()["type"] == "ingreso"
        r = api.post(f"{base_url}/api/businesses/{bid}/transactions",
                     json={"type": "egreso", "amount": 25, "description": "TEST"}, headers=h)
        assert r.status_code == 200


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_shape(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        r = api.get(f"{base_url}/api/businesses/{bid}/dashboard", headers=h)
        assert r.status_code == 200
        d = r.json()
        for k in ["today_sales_total", "today_sales_count", "products_total",
                  "low_stock_count", "low_stock_items", "capital",
                  "income", "expense", "customers_total"]:
            assert k in d
        # capital = income - expense
        assert abs(d["capital"] - (d["income"] - d["expense"])) < 1e-6
        # low_stock_count matches items count returned (<=10)
        assert d["low_stock_count"] >= len(d["low_stock_items"])
        assert d["products_total"] >= 1
        assert d["customers_total"] >= 1


# ---------- Cross-user isolation (customers/sales/transactions) ----------
class TestIsolation:
    def test_customers_sales_tx_isolation(self, api, base_url, user_b):
        hb = auth_headers(user_b["token"])
        bid = pytest.biz_a_id
        cid = pytest.cust_a_id
        assert api.get(f"{base_url}/api/businesses/{bid}/customers", headers=hb).status_code == 404
        assert api.get(f"{base_url}/api/businesses/{bid}/customers/{cid}", headers=hb).status_code == 404
        assert api.get(f"{base_url}/api/businesses/{bid}/customers/{cid}/sales", headers=hb).status_code == 404
        assert api.get(f"{base_url}/api/businesses/{bid}/sales", headers=hb).status_code == 404
        assert api.get(f"{base_url}/api/businesses/{bid}/transactions", headers=hb).status_code == 404
        assert api.get(f"{base_url}/api/businesses/{bid}/dashboard", headers=hb).status_code == 404


# ---------- AI ----------
class TestAI:
    def test_ai_chat_returns_reply(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        r = api.post(f"{base_url}/api/businesses/{bid}/ai/chat",
                     json={"message": "Dame una recomendación corta para aumentar ventas",
                           "history": []}, headers=h, timeout=60)
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "")
        assert isinstance(reply, str) and len(reply) > 0

    def test_ai_chat_requires_auth(self, api, base_url):
        bid = "any"
        r = api.post(f"{base_url}/api/businesses/{bid}/ai/chat",
                     json={"message": "hi", "history": []})
        assert r.status_code == 401

    def test_ai_chat_business_ownership(self, api, base_url, user_b):
        hb = auth_headers(user_b["token"])
        bid = pytest.biz_a_id
        r = api.post(f"{base_url}/api/businesses/{bid}/ai/chat",
                     json={"message": "hi", "history": []}, headers=hb)
        assert r.status_code == 404

    def test_ai_product_description(self, api, base_url, user_a):
        h = auth_headers(user_a["token"])
        bid = pytest.biz_a_id
        r = api.post(f"{base_url}/api/businesses/{bid}/ai/product-description",
                     json={"name": "Collar artesanal",
                           "category": "Joyería", "material": "Plata"}, headers=h, timeout=60)
        assert r.status_code == 200, r.text
        desc = r.json().get("description", "")
        assert isinstance(desc, str) and len(desc) > 0
