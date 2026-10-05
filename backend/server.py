from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, UploadFile, File
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import requests
from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
CLAUDE_MODEL = "claude-haiku-4-5-20251001"

# ---------------- PayPal ----------------
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
PAYPAL_SECRET = os.environ.get("PAYPAL_SECRET", "")
PAYPAL_MODE = (os.environ.get("PAYPAL_MODE") or "sandbox").lower()
PAYPAL_BASE = "https://api-m.sandbox.paypal.com" if PAYPAL_MODE != "live" else "https://api-m.paypal.com"


async def paypal_token() -> str:
    if not PAYPAL_CLIENT_ID or not PAYPAL_SECRET:
        raise HTTPException(500, "PayPal no configurado")
    async with httpx.AsyncClient(timeout=20.0) as cli:
        r = await cli.post(
            f"{PAYPAL_BASE}/v1/oauth2/token",
            auth=(PAYPAL_CLIENT_ID, PAYPAL_SECRET),
            data={"grant_type": "client_credentials"},
            headers={"Accept": "application/json"},
        )
    if r.status_code != 200:
        raise HTTPException(502, f"PayPal auth: {r.status_code} {r.text}")
    return r.json()["access_token"]

# ---------------- Object Storage ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "mis-negocios"
_storage_key: Optional[str] = None


def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = _init_storage()
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if r.status_code == 503:
        _storage_key = None
        key = _init_storage()
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    r.raise_for_status()
    return r.json()


def _get_object(path: str) -> tuple[bytes, str]:
    global _storage_key
    key = _init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 503:
        _storage_key = None
        key = _init_storage()
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- Models ----------------
class User(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = ""
    picture: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class SessionIn(BaseModel):
    session_id: str


class Business(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    subtitle: Optional[str] = ""
    logo: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    facebook: Optional[str] = ""
    instagram: Optional[str] = ""
    tiktok: Optional[str] = ""
    website: Optional[str] = ""
    currency: str = "L"
    color: str = "#9D7A2A"
    usd_rate: float = 24.5  # 1 USD = X Lempiras; used to convert local → USD for PayPal
    created_at: str = Field(default_factory=now_iso)


class BusinessIn(BaseModel):
    name: str
    subtitle: Optional[str] = ""
    logo: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    facebook: Optional[str] = ""
    instagram: Optional[str] = ""
    tiktok: Optional[str] = ""
    website: Optional[str] = ""
    currency: str = "L"
    color: str = "#9D7A2A"
    usd_rate: float = 24.5


class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    business_id: str
    name: str
    description: Optional[str] = ""
    category: Optional[str] = ""
    material: Optional[str] = ""
    sku: Optional[str] = ""
    photos: List[str] = []
    unit_cost: float = 0.0
    extra_costs: float = 0.0
    sale_price: float = 0.0
    stock: int = 0
    min_stock: int = 0
    created_at: str = Field(default_factory=now_iso)


class ProductIn(BaseModel):
    name: str
    description: Optional[str] = ""
    category: Optional[str] = ""
    material: Optional[str] = ""
    sku: Optional[str] = ""
    photos: List[str] = []
    unit_cost: float = 0.0
    extra_costs: float = 0.0
    sale_price: float = 0.0
    stock: int = 0
    min_stock: int = 0


class StockEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    business_id: str
    product_id: str
    quantity: int
    unit_cost: float = 0.0
    note: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class StockEntryIn(BaseModel):
    product_id: str
    quantity: int
    unit_cost: float = 0.0
    note: Optional[str] = ""


class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    business_id: str
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    social: Optional[str] = ""
    birthday: Optional[str] = ""
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    social: Optional[str] = ""
    birthday: Optional[str] = ""
    notes: Optional[str] = ""


class SaleItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    unit_price: float


class Sale(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    business_id: str
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    items: List[SaleItem] = []
    total: float = 0.0
    paid: float = 0.0
    note: Optional[str] = ""
    paypal_order_id: Optional[str] = ""
    paypal_status: Optional[str] = ""  # "created" | "approved" | "captured" | "failed"
    created_at: str = Field(default_factory=now_iso)


class SaleIn(BaseModel):
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    items: List[SaleItem] = []
    paid: float = 0.0
    note: Optional[str] = ""


class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    business_id: str
    type: str
    category: Optional[str] = ""
    amount: float
    description: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class TransactionIn(BaseModel):
    type: str
    category: Optional[str] = ""
    amount: float
    description: Optional[str] = ""


# ---------------- Auth helpers ----------------
async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = auth[7:].strip()
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid token")
    exp = sess.get("expires_at")
    if isinstance(exp, str):
        try:
            exp_dt = datetime.fromisoformat(exp)
        except Exception:
            exp_dt = None
    else:
        exp_dt = exp
    if exp_dt and exp_dt.tzinfo is None:
        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    if exp_dt and exp_dt < datetime.now(timezone.utc):
        raise HTTPException(401, "Token expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def require_business(bid: str, user: dict) -> dict:
    biz = await db.businesses.find_one({"id": bid, "user_id": user["user_id"]}, {"_id": 0})
    if not biz:
        raise HTTPException(404, "Negocio no encontrado")
    return biz


# ---------------- Auth ----------------
@api_router.post("/auth/session")
async def auth_session(data: SessionIn):
    async with httpx.AsyncClient(timeout=15.0) as cli:
        resp = await cli.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": data.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid session")
    j = resp.json()
    email = j.get("email")
    name = j.get("name") or ""
    picture = j.get("picture") or ""
    session_token = j.get("session_token")
    if not email or not session_token:
        raise HTTPException(401, "Invalid session payload")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"email": email}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(User(user_id=user_id, email=email, name=name, picture=picture).dict())

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user}


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def auth_logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------- Businesses ----------------
@api_router.get("/businesses", response_model=List[Business])
async def list_businesses(user: dict = Depends(get_current_user)):
    docs = await db.businesses.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return [Business(**d) for d in docs]


@api_router.post("/businesses", response_model=Business)
async def create_business(data: BusinessIn, user: dict = Depends(get_current_user)):
    b = Business(user_id=user["user_id"], **data.dict())
    await db.businesses.insert_one(b.dict())
    return b


@api_router.get("/businesses/{bid}", response_model=Business)
async def get_business(bid: str, user: dict = Depends(get_current_user)):
    d = await require_business(bid, user)
    return Business(**d)


@api_router.put("/businesses/{bid}", response_model=Business)
async def update_business(bid: str, data: BusinessIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    await db.businesses.update_one({"id": bid}, {"$set": data.dict()})
    d = await db.businesses.find_one({"id": bid}, {"_id": 0})
    return Business(**d)


@api_router.delete("/businesses/{bid}")
async def delete_business(bid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    await db.businesses.delete_one({"id": bid})
    await db.products.delete_many({"business_id": bid})
    await db.customers.delete_many({"business_id": bid})
    await db.sales.delete_many({"business_id": bid})
    await db.transactions.delete_many({"business_id": bid})
    await db.stock_entries.delete_many({"business_id": bid})
    return {"ok": True}


# ---------------- Products ----------------
@api_router.get("/businesses/{bid}/products", response_model=List[Product])
async def list_products(bid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    docs = await db.products.find({"business_id": bid}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [Product(**d) for d in docs]


@api_router.post("/businesses/{bid}/products", response_model=Product)
async def create_product(bid: str, data: ProductIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    p = Product(business_id=bid, **data.dict())
    await db.products.insert_one(p.dict())
    return p


@api_router.get("/businesses/{bid}/products/{pid}", response_model=Product)
async def get_product(bid: str, pid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    d = await db.products.find_one({"id": pid, "business_id": bid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Producto no encontrado")
    return Product(**d)


@api_router.put("/businesses/{bid}/products/{pid}", response_model=Product)
async def update_product(bid: str, pid: str, data: ProductIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    res = await db.products.update_one({"id": pid, "business_id": bid}, {"$set": data.dict()})
    if res.matched_count == 0:
        raise HTTPException(404, "Producto no encontrado")
    d = await db.products.find_one({"id": pid, "business_id": bid}, {"_id": 0})
    return Product(**d)


@api_router.delete("/businesses/{bid}/products/{pid}")
async def delete_product(bid: str, pid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    await db.products.delete_one({"id": pid, "business_id": bid})
    return {"ok": True}


@api_router.post("/businesses/{bid}/stock-entries", response_model=StockEntry)
async def create_stock_entry(bid: str, data: StockEntryIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    prod = await db.products.find_one({"id": data.product_id, "business_id": bid}, {"_id": 0})
    if not prod:
        raise HTTPException(404, "Producto no encontrado")
    entry = StockEntry(business_id=bid, **data.dict())
    await db.stock_entries.insert_one(entry.dict())
    await db.products.update_one(
        {"id": data.product_id, "business_id": bid},
        {"$inc": {"stock": data.quantity}},
    )
    total = data.quantity * data.unit_cost
    if total > 0:
        tx = Transaction(
            business_id=bid, type="egreso", category="Compra de mercadería",
            amount=total, description=f"Entrada de {data.quantity} x {prod.get('name', '')}",
        )
        await db.transactions.insert_one(tx.dict())
    return entry


# ---------------- Customers ----------------
@api_router.get("/businesses/{bid}/customers", response_model=List[Customer])
async def list_customers(bid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    docs = await db.customers.find({"business_id": bid}, {"_id": 0}).sort("name", 1).to_list(2000)
    return [Customer(**d) for d in docs]


@api_router.post("/businesses/{bid}/customers", response_model=Customer)
async def create_customer(bid: str, data: CustomerIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    c = Customer(business_id=bid, **data.dict())
    await db.customers.insert_one(c.dict())
    return c


@api_router.get("/businesses/{bid}/customers/{cid}", response_model=Customer)
async def get_customer(bid: str, cid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    d = await db.customers.find_one({"id": cid, "business_id": bid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Cliente no encontrado")
    return Customer(**d)


@api_router.put("/businesses/{bid}/customers/{cid}", response_model=Customer)
async def update_customer(bid: str, cid: str, data: CustomerIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    res = await db.customers.update_one({"id": cid, "business_id": bid}, {"$set": data.dict()})
    if res.matched_count == 0:
        raise HTTPException(404, "Cliente no encontrado")
    d = await db.customers.find_one({"id": cid, "business_id": bid}, {"_id": 0})
    return Customer(**d)


@api_router.delete("/businesses/{bid}/customers/{cid}")
async def delete_customer(bid: str, cid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    await db.customers.delete_one({"id": cid, "business_id": bid})
    return {"ok": True}


@api_router.get("/businesses/{bid}/customers/{cid}/sales", response_model=List[Sale])
async def customer_sales(bid: str, cid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    docs = await db.sales.find({"business_id": bid, "customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Sale(**d) for d in docs]


# ---------------- Sales ----------------
@api_router.get("/businesses/{bid}/sales", response_model=List[Sale])
async def list_sales(bid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    docs = await db.sales.find({"business_id": bid}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [Sale(**d) for d in docs]


@api_router.post("/businesses/{bid}/sales", response_model=Sale)
async def create_sale(bid: str, data: SaleIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    if not data.items:
        raise HTTPException(400, "La venta debe tener al menos un producto")
    total = sum(i.quantity * i.unit_price for i in data.items)
    sale = Sale(
        business_id=bid,
        customer_id=data.customer_id or "",
        customer_name=data.customer_name or "",
        items=data.items,
        total=total,
        paid=data.paid,
        note=data.note or "",
    )
    await db.sales.insert_one(sale.dict())
    for it in data.items:
        await db.products.update_one(
            {"id": it.product_id, "business_id": bid},
            {"$inc": {"stock": -it.quantity}},
        )
    if data.paid > 0:
        tx = Transaction(
            business_id=bid, type="ingreso", category="Venta",
            amount=data.paid, description=f"Venta #{sale.id[:8]}",
        )
        await db.transactions.insert_one(tx.dict())
    return sale


@api_router.delete("/businesses/{bid}/sales/{sid}")
async def delete_sale(bid: str, sid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    await db.sales.delete_one({"id": sid, "business_id": bid})
    return {"ok": True}


# ---------------- PayPal (Sandbox) ----------------
class PayPalOrderIn(BaseModel):
    return_url: str
    cancel_url: Optional[str] = ""
    amount_usd: Optional[float] = None  # defaults to sale.total - sale.paid


@api_router.post("/businesses/{bid}/sales/{sid}/paypal/order")
async def paypal_create_order(bid: str, sid: str, data: PayPalOrderIn, user: dict = Depends(get_current_user)):
    biz = await require_business(bid, user)
    sale = await db.sales.find_one({"id": sid, "business_id": bid}, {"_id": 0})
    if not sale:
        raise HTTPException(404, "Venta no encontrada")

    due_local = max(0.0, (sale.get("total", 0.0) - sale.get("paid", 0.0)))
    currency = (biz.get("currency") or "L").upper()
    rate = float(biz.get("usd_rate") or 24.5)
    if rate <= 0:
        rate = 24.5

    # Decide USD amount
    if data.amount_usd and data.amount_usd > 0:
        due_usd = float(data.amount_usd)
    elif currency == "USD":
        due_usd = due_local
    else:
        due_usd = round(due_local / rate, 2)

    if due_usd <= 0:
        raise HTTPException(400, "La venta ya está pagada")

    token = await paypal_token()
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": sid,
            "description": f"Venta #{sid[:8]}",
            "amount": {"currency_code": "USD", "value": f"{due_usd:.2f}"},
        }],
        "application_context": {
            "brand_name": biz.get("name") or "Mis Negocios",
            "user_action": "PAY_NOW",
            "return_url": data.return_url,
            "cancel_url": data.cancel_url or data.return_url,
        },
    }
    async with httpx.AsyncClient(timeout=25.0) as cli:
        r = await cli.post(
            f"{PAYPAL_BASE}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
        )
    if r.status_code not in (200, 201):
        raise HTTPException(502, f"PayPal create order: {r.status_code} {r.text}")
    j = r.json()
    order_id = j["id"]
    approve_url = next((l["href"] for l in j.get("links", []) if l.get("rel") == "approve"), None)
    if not approve_url:
        raise HTTPException(502, "PayPal: approve_url no encontrado")
    await db.sales.update_one(
        {"id": sid, "business_id": bid},
        {"$set": {"paypal_order_id": order_id, "paypal_status": "created"}},
    )
    return {
        "order_id": order_id,
        "approve_url": approve_url,
        "amount_usd": round(due_usd, 2),
        "due_local": round(due_local, 2),
        "currency": currency,
        "usd_rate": rate,
    }


@api_router.post("/businesses/{bid}/sales/{sid}/paypal/capture")
async def paypal_capture(bid: str, sid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    sale = await db.sales.find_one({"id": sid, "business_id": bid}, {"_id": 0})
    if not sale:
        raise HTTPException(404, "Venta no encontrada")
    order_id = sale.get("paypal_order_id")
    if not order_id:
        raise HTTPException(400, "No hay orden PayPal pendiente para esta venta")

    token = await paypal_token()
    async with httpx.AsyncClient(timeout=25.0) as cli:
        r = await cli.post(
            f"{PAYPAL_BASE}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    if r.status_code not in (200, 201):
        # 422 ORDER_ALREADY_CAPTURED -> treat as success via GET order
        if r.status_code == 422 and "ORDER_ALREADY_CAPTURED" in r.text:
            async with httpx.AsyncClient(timeout=15.0) as cli:
                g = await cli.get(
                    f"{PAYPAL_BASE}/v2/checkout/orders/{order_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
            if g.status_code == 200:
                j = g.json()
            else:
                raise HTTPException(502, f"PayPal capture: {r.status_code} {r.text}")
        else:
            raise HTTPException(502, f"PayPal capture: {r.status_code} {r.text}")
    else:
        j = r.json()

    status = j.get("status", "")
    captured_value = 0.0
    try:
        pu = (j.get("purchase_units") or [{}])[0]
        caps = (pu.get("payments") or {}).get("captures") or []
        if caps:
            captured_value = float(caps[0].get("amount", {}).get("value") or 0.0)
    except Exception:
        pass

    biz = await db.businesses.find_one({"id": bid}, {"_id": 0}) or {}
    rate = float(biz.get("usd_rate") or 24.5)
    if rate <= 0:
        rate = 24.5
    currency = (biz.get("currency") or "L").upper()
    captured_local = captured_value if currency == "USD" else round(captured_value * rate, 2)

    paid_before = float(sale.get("paid", 0.0))
    if status.upper() == "COMPLETED":
        new_paid = round(paid_before + captured_local, 2)
        await db.sales.update_one(
            {"id": sid, "business_id": bid},
            {"$set": {"paid": new_paid, "paypal_status": "captured"}},
        )
        tx = Transaction(
            business_id=bid, type="ingreso", category="PayPal",
            amount=captured_local,
            description=f"PayPal venta #{sid[:8]} (USD {captured_value:.2f} @ {rate:.2f})",
        )
        await db.transactions.insert_one(tx.dict())
        return {
            "ok": True, "status": status,
            "captured_usd": captured_value,
            "captured_local": captured_local,
            "paid": new_paid,
        }

    await db.sales.update_one(
        {"id": sid, "business_id": bid},
        {"$set": {"paypal_status": status.lower() or "failed"}},
    )
    raise HTTPException(400, f"Estado PayPal: {status or 'desconocido'}")


# ---------------- Transactions ----------------
@api_router.get("/businesses/{bid}/transactions", response_model=List[Transaction])
async def list_transactions(bid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    docs = await db.transactions.find({"business_id": bid}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return [Transaction(**d) for d in docs]


@api_router.post("/businesses/{bid}/transactions", response_model=Transaction)
async def create_transaction(bid: str, data: TransactionIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    if data.type not in ("ingreso", "egreso"):
        raise HTTPException(400, "Tipo inválido")
    tx = Transaction(business_id=bid, **data.dict())
    await db.transactions.insert_one(tx.dict())
    return tx


@api_router.delete("/businesses/{bid}/transactions/{tid}")
async def delete_transaction(bid: str, tid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    await db.transactions.delete_one({"id": tid, "business_id": bid})
    return {"ok": True}


# ---------------- Dashboard ----------------
@api_router.get("/businesses/{bid}/dashboard")
async def dashboard(bid: str, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    today = datetime.now(timezone.utc).date().isoformat()
    sales = await db.sales.find({"business_id": bid}, {"_id": 0}).to_list(5000)
    today_total = 0.0
    today_count = 0
    for s in sales:
        if (s.get("created_at") or "").startswith(today):
            today_total += s.get("total", 0.0)
            today_count += 1
    products = await db.products.find({"business_id": bid}, {"_id": 0}).to_list(5000)
    low_stock = [p for p in products if p.get("stock", 0) <= p.get("min_stock", 0)]
    txs = await db.transactions.find({"business_id": bid}, {"_id": 0}).to_list(5000)
    income = sum(t["amount"] for t in txs if t["type"] == "ingreso")
    expense = sum(t["amount"] for t in txs if t["type"] == "egreso")
    return {
        "today_sales_total": today_total,
        "today_sales_count": today_count,
        "products_total": len(products),
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:10],
        "capital": income - expense,
        "income": income,
        "expense": expense,
        "customers_total": await db.customers.count_documents({"business_id": bid}),
    }


@api_router.get("/")
async def root():
    return {"message": "Mis Negocios API"}


# ---------------- Files / Object Storage ----------------
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def _ext_from_mime(mime: str) -> str:
    return {
        "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
        "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
    }.get(mime, "jpg")


@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Archivo demasiado grande (máx 10MB)")
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, f"Tipo no soportado: {mime}")
    ext = _ext_from_mime(mime)
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await run_in_threadpool(_put_object, path, content, mime)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 500
        if status == 402:
            raise HTTPException(402, "Sin crédito de almacenamiento")
        raise HTTPException(502, f"Error subiendo archivo: {status}")
    except Exception as e:
        logger.exception("upload failed")
        raise HTTPException(502, f"Error subiendo archivo: {e}")

    await db.files.insert_one({
        "path": path,
        "user_id": user["user_id"],
        "size": len(content),
        "content_type": mime,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": path, "url": f"/api/files/{path}"}


@api_router.get("/files/{file_path:path}")
async def get_file(file_path: str):
    # Public read for product/catalog display; existence is validated via DB
    meta = await db.files.find_one({"path": file_path}, {"_id": 0})
    if not meta:
        raise HTTPException(404, "Archivo no encontrado")
    try:
        data, ct = await run_in_threadpool(_get_object, file_path)
    except Exception as e:
        logger.warning("file fetch error: %s", e)
        raise HTTPException(404, "Archivo no encontrado")
    return Response(
        content=data,
        media_type=meta.get("content_type") or ct,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


# ---------------- AI (Claude Haiku 4.5) ----------------
class AIChatIn(BaseModel):
    message: str
    history: List[dict] = []  # [{role: "user"|"assistant", content: str}]


class AIDescIn(BaseModel):
    name: str
    category: Optional[str] = ""
    material: Optional[str] = ""


async def build_business_context(bid: str) -> str:
    biz = await db.businesses.find_one({"id": bid}, {"_id": 0})
    if not biz:
        return ""
    products = await db.products.find({"business_id": bid}, {"_id": 0}).to_list(500)
    customers_count = await db.customers.count_documents({"business_id": bid})
    sales = await db.sales.find({"business_id": bid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    txs = await db.transactions.find({"business_id": bid}, {"_id": 0}).to_list(1000)
    income = sum(t["amount"] for t in txs if t["type"] == "ingreso")
    expense = sum(t["amount"] for t in txs if t["type"] == "egreso")
    low_stock = [p for p in products if p.get("stock", 0) <= p.get("min_stock", 0)]
    top_products = sorted(products, key=lambda p: p.get("stock", 0))[:10]
    recent_sales = sales[:10]
    cur = biz.get("currency", "L")

    lines = [
        f"Negocio: {biz.get('name')} ({biz.get('subtitle', '') or 'sin subtítulo'}).",
        f"Moneda: {cur}.",
        f"Productos totales: {len(products)} · Clientes: {customers_count}.",
        f"Capital: {cur} {(income - expense):.2f} (Ingresos: {cur} {income:.2f} · Egresos: {cur} {expense:.2f}).",
        f"Productos con stock bajo ({len(low_stock)}): " + (", ".join(f"{p['name']} ({p.get('stock',0)}/{p.get('min_stock',0)})" for p in low_stock[:10]) or "ninguno"),
        "Muestra de productos: " + (", ".join(f"{p['name']} [{p.get('category','?')}] stock={p.get('stock',0)} precio={p.get('sale_price',0)}" for p in top_products) or "sin productos"),
        f"Ventas recientes ({len(recent_sales)}): " + (", ".join(f"{s.get('customer_name') or 'anónimo'} {cur}{s.get('total',0):.2f}" for s in recent_sales) or "ninguna"),
    ]
    return "\n".join(lines)


@api_router.post("/businesses/{bid}/ai/chat")
async def ai_chat(bid: str, data: AIChatIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY no configurada")
    ctx = await build_business_context(bid)
    system = (
        "Eres un asistente de negocios experto que ayuda a dueños de pequeños negocios. "
        "Responde SIEMPRE en español, de forma clara, concisa y accionable. "
        "Usa viñetas cuando listes recomendaciones. No inventes datos que no estén en el contexto.\n\n"
        f"Contexto del negocio activo:\n{ctx}"
    )
    # Fold history into the current prompt to stay stateless per request
    history_txt = ""
    for m in (data.history or [])[-10:]:
        role = m.get("role", "user")
        content = (m.get("content") or "").strip()
        if not content:
            continue
        history_txt += f"\n{'Usuario' if role == 'user' else 'Asistente'}: {content}"
    prompt = (history_txt + f"\nUsuario: {data.message}\nAsistente:").strip() if history_txt else data.message

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"biz-{bid}-{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", CLAUDE_MODEL)
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.exception("AI chat failed")
        raise HTTPException(502, f"AI error: {e}")
    return {"reply": str(reply).strip()}


@api_router.post("/businesses/{bid}/ai/product-description")
async def ai_product_description(bid: str, data: AIDescIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY no configurada")
    if not data.name.strip():
        raise HTTPException(400, "Nombre requerido")
    system = (
        "Eres un redactor experto en comercio minorista. Genera descripciones de producto en español, "
        "en 2 o 3 oraciones, con tono cálido y profesional. No incluyas precio ni emojis. "
        "No inventes materiales ni tallas que no te hayan dado."
    )
    prompt = (
        f"Producto: {data.name}\n"
        f"Categoría: {data.category or 'no especificada'}\n"
        f"Material: {data.material or 'no especificado'}\n\n"
        "Escribe una descripción corta y atractiva para catálogo."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"desc-{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", CLAUDE_MODEL)
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.exception("AI description failed")
        raise HTTPException(502, f"AI error: {e}")
    return {"description": str(reply).strip()}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.businesses.create_index("user_id")
        await db.files.create_index("path", unique=True)
    except Exception as e:
        logger.warning("Index creation warning: %s", e)
    try:
        await run_in_threadpool(_init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning("Object storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
