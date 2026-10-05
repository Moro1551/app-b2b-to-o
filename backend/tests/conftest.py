import os
import uuid
import datetime
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="session")
def mongo():
    cli = MongoClient(MONGO_URL)
    return cli[DB_NAME]


def _seed_user(db, email_prefix: str):
    user_id = f"user_test_{uuid.uuid4().hex[:8]}"
    token = f"tok_test_{uuid.uuid4().hex}"
    email = f"TEST_{email_prefix}_{uuid.uuid4().hex[:6]}@example.com"
    db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": f"QA {email_prefix}",
        "picture": "",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1),
        "created_at": datetime.datetime.now(datetime.timezone.utc),
    })
    return user_id, token, email


@pytest.fixture(scope="session")
def user_a(mongo):
    user_id, token, email = _seed_user(mongo, "A")
    yield {"user_id": user_id, "token": token, "email": email}
    # cleanup
    biz_ids = [b["id"] for b in mongo.businesses.find({"user_id": user_id}, {"id": 1})]
    for bid in biz_ids:
        mongo.products.delete_many({"business_id": bid})
        mongo.customers.delete_many({"business_id": bid})
        mongo.sales.delete_many({"business_id": bid})
        mongo.transactions.delete_many({"business_id": bid})
        mongo.stock_entries.delete_many({"business_id": bid})
    mongo.businesses.delete_many({"user_id": user_id})
    mongo.user_sessions.delete_many({"user_id": user_id})
    mongo.users.delete_one({"user_id": user_id})


@pytest.fixture(scope="session")
def user_b(mongo):
    user_id, token, email = _seed_user(mongo, "B")
    yield {"user_id": user_id, "token": token, "email": email}
    biz_ids = [b["id"] for b in mongo.businesses.find({"user_id": user_id}, {"id": 1})]
    for bid in biz_ids:
        mongo.products.delete_many({"business_id": bid})
        mongo.customers.delete_many({"business_id": bid})
        mongo.sales.delete_many({"business_id": bid})
        mongo.transactions.delete_many({"business_id": bid})
        mongo.stock_entries.delete_many({"business_id": bid})
    mongo.businesses.delete_many({"user_id": user_id})
    mongo.user_sessions.delete_many({"user_id": user_id})
    mongo.users.delete_one({"user_id": user_id})


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL
