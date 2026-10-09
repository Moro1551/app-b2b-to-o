from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, UploadFile, File, Query
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import os
import re
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from urllib.parse import quote


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------- AI (Google Gemini, free tier) ----------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# Tried in order: a quota (429) or unknown model (404) on one falls through to the next.
GEMINI_MODELS = [
    m.strip()
    for m in (os.environ.get("GEMINI_MODELS") or "gemini-3.8-flash,gemini-3.5-flash-lite").split(",")
    if m.strip()
]


async def gemini_generate(system: str, contents: list[dict]) -> str:
    """contents: Gemini turns, e.g. [{"role": "user", "parts": [{"text": "..."}]}]."""
    if not GEMINI_API_KEY:
        raise HTTPException(503, "La IA no está configurada en el servidor (falta GEMINI_API_KEY).")
    body = {"system_instruction": {"parts": [{"text": system}]}, "contents": contents}
    last_status = 0
    async with httpx.AsyncClient(timeout=60.0) as cli:
        for model in GEMINI_MODELS:
            r = await cli.post(
                GEMINI_URL.format(model=model),
                headers={"x-goog-api-key": GEMINI_API_KEY},
                json=body,
            )
            if r.status_code == 200:
                parts = ((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts).strip()
                if text:
                    return text
                raise HTTPException(502, "La IA no devolvió una respuesta. Intenta reformular.")
            last_status = r.status_code
            logger.warning("Gemini %s -> HTTP %s: %s", model, r.status_code, r.text[:300])
            if r.status_code not in (404, 429):
                break
    if last_status == 429:
        raise HTTPException(429, "Se alcanzó el límite gratuito de la IA por ahora. Intenta en unos minutos.")
    if last_status in (400, 401, 403):
        raise HTTPException(502, "La clave de la IA (GEMINI_API_KEY) no es válida.")
    raise HTTPException(502, f"La IA no respondió (HTTP {last_status}). Intenta de nuevo.")

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


# ---------------- FX rates (free public API) ----------------
FX_SOURCE = "open.er-api.com"
FX_URL = "https://open.er-api.com/v6/latest/USD"
FX_TTL_SECONDS = 60 * 60 * 12  # 12h cache


async def fetch_usd_to_hnl() -> dict:
    """Returns {rate, source, fetched_at}. Cached in db.fx_cache."""
    cached = await db.fx_cache.find_one({"pair": "USD_HNL"}, {"_id": 0})
    if cached:
        try:
            fetched = datetime.fromisoformat(cached["fetched_at"])
            if fetched.tzinfo is None:
                fetched = fetched.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - fetched).total_seconds() < FX_TTL_SECONDS:
                return cached
        except Exception:
            pass
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(FX_URL)
        r.raise_for_status()
        j = r.json()
        rate = float((j.get("rates") or {}).get("HNL") or 0.0)
        if rate <= 0:
            raise ValueError("HNL rate missing")
        doc = {
            "pair": "USD_HNL",
            "rate": round(rate, 4),
            "source": FX_SOURCE,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.fx_cache.update_one({"pair": "USD_HNL"}, {"$set": doc}, upsert=True)
        return doc
    except Exception as e:
        logger.warning("FX fetch failed: %s", e)
        if cached:
            return cached
        return {"pair": "USD_HNL", "rate": 24.5, "source": "fallback", "fetched_at": now_iso()}


async def effective_usd_rate(biz: dict) -> tuple[float, str]:
    """Returns (rate, source) considering auto_rate flag."""
    if biz.get("auto_rate"):
        fx = await fetch_usd_to_hnl()
        return float(fx.get("rate") or 24.5), fx.get("source", "auto")
    rate = float(biz.get("usd_rate") or 24.5)
    if rate <= 0:
        rate = 24.5
    return rate, "manual"

# ---------------- File storage ----------------
# Uploaded files live in MongoDB itself (db.files: metadata + bytes in "data"), so the
# app needs no external storage service. One document per file keeps us under
# MongoDB's 16 MB document limit as long as uploads stay below MAX_UPLOAD_BYTES.
APP_NAME = "mis-negocios"

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10000)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Honduras is UTC-6 all year (no daylight saving time). Used when the app doesn't send its offset.
DEFAULT_TZ_OFFSET_MIN = -360


def local_date(iso: Optional[str], tz: timezone):
    """Calendar date of a stored UTC timestamp in the given timezone, or None if unparseable."""
    try:
        dt = datetime.fromisoformat(iso or "")
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz).date()


# ---------------- Models ----------------
class User(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = ""
    picture: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class SessionIn(BaseModel):
    session_id: str


# Navy of the app icon; used for the catalog/PDF header when a business has not picked one.
DEFAULT_CATALOG_COLOR = "#00183F"


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
    color: str = DEFAULT_CATALOG_COLOR
    usd_rate: float = 24.5  # 1 USD = X Lempiras; manual override
    auto_rate: bool = False  # when True, use live FX rate instead of usd_rate
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
    color: str = DEFAULT_CATALOG_COLOR
    usd_rate: float = 24.5
    auto_rate: bool = False


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


SALE_PAYMENT_METHODS = {"efectivo": "Efectivo", "transferencia": "Transferencia", "otro": "Otro"}


class SalePayment(BaseModel):
    amount: float
    method: str  # "venta" (paid when the sale was created) | "paypal" | a key of SALE_PAYMENT_METHODS
    note: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


class Sale(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    business_id: str
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    items: List[SaleItem] = []
    total: float = 0.0
    paid: float = 0.0
    # Sales created before this field existed have paid > sum(payments).
    payments: List[SalePayment] = []
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
    sale_id: Optional[str] = ""  # set on the income a sale records, so deleting the sale removes it
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
        payments=[SalePayment(amount=data.paid, method="venta")] if data.paid > 0 else [],
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
            amount=data.paid, description=f"Venta #{sale.id[:8]}", sale_id=sale.id,
        )
        await db.transactions.insert_one(tx.dict())
    return sale


@api_router.delete("/businesses/{bid}/sales/{sid}")
async def delete_sale(bid: str, sid: str, user: dict = Depends(get_current_user)):
    """Undoes the sale: its units go back to stock and the income it recorded is removed."""
    await require_business(bid, user)
    sale = await db.sales.find_one({"id": sid, "business_id": bid}, {"_id": 0})
    if not sale:
        return {"ok": True, "restocked": 0, "removed_transactions": 0}
    # Only the request that actually deletes the sale undoes it, so a repeated delete can't restock twice.
    res = await db.sales.delete_one({"id": sid, "business_id": bid})
    if res.deleted_count == 0:
        return {"ok": True, "restocked": 0, "removed_transactions": 0}
    restocked = 0
    for it in sale.get("items") or []:
        qty = int(it.get("quantity") or 0)
        await db.products.update_one({"id": it.get("product_id"), "business_id": bid}, {"$inc": {"stock": qty}})
        restocked += qty
    # Income recorded before transactions had sale_id is recognized by the "#<id[:8]>" in its description.
    legacy = rf"^(Venta|Abono venta|PayPal venta) #{re.escape(sid[:8])}\b"
    removed = await db.transactions.delete_many(
        {"business_id": bid, "type": "ingreso", "$or": [{"sale_id": sid}, {"description": {"$regex": legacy}}]}
    )
    return {"ok": True, "restocked": restocked, "removed_transactions": removed.deleted_count}


class SalePaymentIn(BaseModel):
    amount: float
    method: str = "efectivo"
    note: Optional[str] = ""


@api_router.post("/businesses/{bid}/sales/{sid}/payments", response_model=Sale)
async def add_sale_payment(bid: str, sid: str, data: SalePaymentIn, user: dict = Depends(get_current_user)):
    """Registers a cash/transfer payment (full or partial) for a sale with a pending balance."""
    await require_business(bid, user)
    if data.method not in SALE_PAYMENT_METHODS:
        raise HTTPException(400, "Método de pago no válido")
    amount = round(float(data.amount), 2)
    if amount <= 0:
        raise HTTPException(400, "El monto debe ser mayor que cero")
    sale = await db.sales.find_one({"id": sid, "business_id": bid}, {"_id": 0})
    if not sale:
        raise HTTPException(404, "Venta no encontrada")
    paid_before = float(sale.get("paid", 0.0))
    due = round(float(sale.get("total", 0.0)) - paid_before, 2)
    if due <= 0:
        raise HTTPException(400, "La venta ya está pagada")
    if amount > due:
        raise HTTPException(400, f"El monto supera lo pendiente ({due:.2f})")

    payment = SalePayment(amount=amount, method=data.method, note=(data.note or "").strip())
    # Matching on the previous "paid" rejects a second, simultaneous payment instead of double-counting it.
    # (No default: None also matches a document without the field.)
    res = await db.sales.update_one(
        {"id": sid, "business_id": bid, "paid": sale.get("paid")},
        {"$set": {"paid": round(paid_before + amount, 2)}, "$push": {"payments": payment.dict()}},
    )
    if res.modified_count == 0:
        raise HTTPException(409, "La venta cambió mientras registrabas el pago. Revisa el saldo e inténtalo de nuevo.")
    tx = Transaction(
        business_id=bid, type="ingreso", category="Venta",
        amount=amount, description=f"Abono venta #{sid[:8]} · {SALE_PAYMENT_METHODS[data.method]}", sale_id=sid,
    )
    await db.transactions.insert_one(tx.dict())
    updated = await db.sales.find_one({"id": sid, "business_id": bid}, {"_id": 0})
    return Sale(**updated)


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
    rate, rate_source = await effective_usd_rate(biz)

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
        {"$set": {"paypal_order_id": order_id, "paypal_status": "created", "paypal_rate_used": rate}},
    )
    return {
        "order_id": order_id,
        "approve_url": approve_url,
        "amount_usd": round(due_usd, 2),
        "due_local": round(due_local, 2),
        "currency": currency,
        "usd_rate": rate,
        "rate_source": rate_source,
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
    # PayPal answers ORDER_ALREADY_CAPTURED with the same amount, which would be added again.
    if sale.get("paypal_status") == "captured":
        raise HTTPException(400, "Este pago de PayPal ya fue registrado")

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
    # Prefer the exact rate used when creating this order (consistency guarantee)
    rate = float(sale.get("paypal_rate_used") or 0.0)
    if rate <= 0:
        rate, _ = await effective_usd_rate(biz)
    currency = (biz.get("currency") or "L").upper()
    captured_local = captured_value if currency == "USD" else round(captured_value * rate, 2)

    paid_before = float(sale.get("paid", 0.0))
    if status.upper() == "COMPLETED":
        due_before = round(float(sale.get("total", 0.0)) - paid_before, 2)
        # Rounding the order to whole US cents can leave a few local cents pending (L 100 -> USD 4.08 ->
        # L 99.96); a shortfall under one US cent counts as paid in full, and the sale is never overpaid.
        one_cent_local = 0.01 if currency == "USD" else 0.01 * rate
        credited = due_before if due_before - captured_local < one_cent_local else captured_local
        credited = max(0.0, min(credited, due_before))
        new_paid = round(paid_before + credited, 2)
        payment = SalePayment(amount=credited, method="paypal", note=f"USD {captured_value:.2f}")
        res = await db.sales.update_one(
            {"id": sid, "business_id": bid, "paypal_status": {"$ne": "captured"}},
            {"$set": {"paid": new_paid, "paypal_status": "captured"}, "$push": {"payments": payment.dict()}},
        )
        if res.modified_count == 0:
            raise HTTPException(400, "Este pago de PayPal ya fue registrado")
        # The income is what PayPal actually delivered, even if it differs from what the sale needed.
        tx = Transaction(
            business_id=bid, type="ingreso", category="PayPal",
            amount=captured_local,
            description=f"PayPal venta #{sid[:8]} (USD {captured_value:.2f} @ {rate:.2f})",
            sale_id=sid,
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


# ---------------- Backup ----------------
@api_router.get("/export")
async def export_data(user: dict = Depends(get_current_user)):
    """Everything the user owns as one JSON document to keep outside the database (the free Atlas
    plan has no backups). Photos stay as links; their bytes would make the file too big to share."""
    businesses = await db.businesses.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    out = []
    for b in businesses:
        q = {"business_id": b["id"]}
        entry = {"business": b}
        for name in ("products", "customers", "sales", "transactions", "stock_entries"):
            entry[name] = await db[name].find(q, {"_id": 0}).sort("created_at", 1).to_list(20000)
        out.append(entry)
    return {
        "app": "Mis Negocios",
        "format": 1,
        "exported_at": now_iso(),
        "user": {"email": user.get("email", ""), "name": user.get("name", "")},
        "businesses": out,
    }


# ---------------- Dashboard ----------------
@api_router.get("/businesses/{bid}/dashboard")
async def dashboard(
    bid: str,
    # Minutes east of UTC on the user's phone (Honduras: -360), so "today" matches their clock.
    tz_offset: int = Query(DEFAULT_TZ_OFFSET_MIN, ge=-720, le=840),
    user: dict = Depends(get_current_user),
):
    await require_business(bid, user)
    tz = timezone(timedelta(minutes=tz_offset))
    today = datetime.now(tz).date()
    sales = await db.sales.find({"business_id": bid}, {"_id": 0}).to_list(5000)
    today_total = 0.0
    today_count = 0
    for s in sales:
        if local_date(s.get("created_at"), tz) == today:
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


@api_router.get("/health")
async def health():
    # Always 200 so the host's health check passes; "db" tells whether MongoDB is reachable
    # (files are stored there too). "ai" only says whether a key is configured.
    try:
        await asyncio.wait_for(db.command("ping"), timeout=3)
        db_status = "ok"
    except Exception as e:
        logger.warning("health: db ping failed: %s", e)
        db_status = "error"
    return {"ok": True, "db": db_status, "ai": "configured" if GEMINI_API_KEY else "missing"}


@api_router.get("/fx/usd-to-hnl")
async def fx_usd_to_hnl(user: dict = Depends(get_current_user)):
    return await fetch_usd_to_hnl()


# ---------------- Public catalog (no auth) ----------------
def _html_escape(s) -> str:
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _resolve_photo(url: str, request_base: str) -> str:
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/api/"):
        return f"{request_base}{url}"
    if "/uploads/" in url:
        return f"{request_base}/api/files/{url}"
    return url


# Same look as the PDF catalog (frontend/src/catalog-html.ts): the business band with its logo and
# categories, framed product cards on a light stone background, and the contacts at the foot.
_CATALOG_GRAIN = (
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>"
    "<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>"
    "<feColorMatrix values='0 0 0 0 0.3  0 0 0 0 0.28  0 0 0 0 0.25  0 0 0 0.10 0'/></filter>"
    "<rect width='100%' height='100%' filter='url(%23g)'/></svg>\")"
)

_CATALOG_CSS = """
:root { --brand: __BRAND__; --grain: __GRAIN__; --ink: #3B3936; --muted: #77716A; --stone: #ECEAE6; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  min-height: 100vh; color: var(--ink); font-family: "Montserrat", "Helvetica Neue", Roboto, Arial, sans-serif;
  background: radial-gradient(ellipse at 15% 30%, rgba(255,255,255,.55), transparent 45%), var(--grain), var(--stone);
}
header { padding: 28px 20px 88px; text-align: center; color: #fff; background: var(--grain), var(--brand); }
.logo {
  width: 64px; height: 64px; margin: 0 auto; border-radius: 8px; background: #fff; overflow: hidden;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,.2);
}
.logo img { width: 100%; height: 100%; object-fit: contain; }
.logo span { font-size: 30px; font-weight: 700; color: var(--brand); }
h1 { margin-top: 14px; font-size: clamp(24px, 6.5vw, 40px); line-height: 1.15; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.tagline { margin-top: 6px; font-size: clamp(14px, 3.6vw, 17px); font-weight: 600; opacity: .92; }
/* One line, centered while it fits and scrolling sideways on narrow phones. */
.cats {
  display: flex; align-items: center; width: max-content; max-width: 100%; margin: 18px auto 0;
  overflow-x: auto; white-space: nowrap; scrollbar-width: none;
}
.cats::-webkit-scrollbar { display: none; }
.cat {
  padding: 6px 2px 4px; border: 0; border-bottom: 1px solid transparent; background: none; color: #fff; cursor: pointer;
  font: inherit; font-size: 11px; letter-spacing: .3em; text-transform: uppercase; opacity: .8;
}
button.cat:hover { opacity: 1; }
.cat.on { opacity: 1; font-weight: 700; border-bottom-color: #fff; }
.sep { margin: 0 12px; font-size: 11px; opacity: .45; }
main { max-width: 1040px; margin: -62px auto 0; padding: 0 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
@media (min-width: 640px) {
  main { padding: 0 28px; }
  .grid { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 26px; }
}
.card {
  display: flex; flex-direction: column; padding: 8px 8px 0; background: #fff; cursor: pointer;
  box-shadow: 0 4px 12px rgba(45,38,30,.13), 0 1px 2px rgba(45,38,30,.10); transition: transform .15s ease, box-shadow .15s ease;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(45,38,30,.16); }
.card.hidden { display: none; }
.photo { aspect-ratio: 4 / 3; background: #F1EEEA; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo span { font-size: 40px; font-weight: 700; color: #D5CFC7; }
h2 {
  margin-top: 9px; min-height: 2.6em; font-size: 13.5px; line-height: 1.3; font-weight: 700;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.meta { flex: 1; display: flex; flex-direction: column; margin: 9px -8px 0; padding: 8px 8px 10px; background: #F4F2EF; border-top: 1px solid #E8E4DF; }
.ref, .detail { font-size: 10.5px; line-height: 1.45; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ref { text-transform: uppercase; letter-spacing: .05em; }
.price { margin: 4px 0 10px; font-size: 15px; font-weight: 700; }
.price u { text-decoration-thickness: 1px; text-underline-offset: 3px; }
.out { margin-left: 8px; font-size: 9px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #A0473C; }
.order {
  margin-top: auto; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 6px;
  background: var(--grain), var(--brand); color: #fff; text-decoration: none;
  font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
}
.empty { grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--muted); background: #fff; }
footer { max-width: 1040px; margin: 0 auto; padding: 40px 20px 32px; text-align: center; }
.contacts { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; font-size: 12px; color: var(--muted); }
.contacts a { color: inherit; text-decoration: none; }
.contacts a:hover { text-decoration: underline; }
.pill {
  display: inline-block; max-width: 100%; margin-top: 16px; padding: 9px 26px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  background: var(--grain), var(--brand); color: #fff; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
}
.credit { margin-top: 18px; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #A8A29A; }
.modal { position: fixed; inset: 0; z-index: 10; display: none; align-items: center; justify-content: center; padding: 16px; background: rgba(20,18,16,.72); }
.modal.open { display: flex; }
.sheet { position: relative; width: 100%; max-width: 520px; max-height: 92vh; overflow: auto; background: #fff; border-radius: 8px; }
.sheet img { width: 100%; max-height: 58vh; object-fit: contain; display: block; background: #F1EEEA; }
.sbody { padding: 18px 20px 22px; }
.sbody h3 { font-size: 19px; line-height: 1.3; font-weight: 700; }
.sbody .ref { margin-top: 6px; white-space: normal; }
.sbody .detail { white-space: normal; }
.sdesc { margin-top: 12px; font-size: 14px; line-height: 1.55; color: #55504A; white-space: pre-wrap; }
.sbody .price { margin: 12px 0 0; font-size: 20px; }
.sbody .order { margin-top: 16px; padding: 12px; font-size: 12px; }
.close {
  position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; border: 0; border-radius: 6px;
  background: rgba(255,255,255,.92); color: var(--ink); font-size: 20px; cursor: pointer;
}
"""

_CATALOG_JS = """
const cards = [...document.querySelectorAll(".card")];
const emptyFilter = document.getElementById("emptyFilter");
document.querySelectorAll("button.cat").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll("button.cat").forEach((b) => b.classList.toggle("on", b === btn));
  let shown = 0;
  cards.forEach((c) => {
    const match = btn.dataset.cat === "*" || c.dataset.cat === btn.dataset.cat;
    c.classList.toggle("hidden", !match);
    if (match) shown++;
  });
  emptyFilter.style.display = shown ? "none" : "block";
}));
const modal = document.getElementById("modal");
const $ = (id) => document.getElementById(id);
cards.forEach((c) => c.addEventListener("click", (e) => {
  if (e.target.closest(".order")) return;
  const d = c.dataset;
  $("mimg").style.display = d.photo ? "block" : "none";
  if (d.photo) $("mimg").src = d.photo;
  $("mname").textContent = d.name;
  $("mref").textContent = d.ref;
  $("mdetail").textContent = d.detail;
  $("mdesc").textContent = d.desc;
  $("mprice").textContent = d.price;
  $("mout").style.display = d.out ? "inline" : "none";
  $("morder").href = c.querySelector(".order").href;
  modal.classList.add("open");
}));
const closeModal = () => modal.classList.remove("open");
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
$("mclose").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
"""

_WA_ICON = (
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.5 0 .2 5.3.2 11.84a11.74 11.74 0 001.65 6l-1.75 6.38 6.54-1.71a11.86 11.86 0 005.4 1.37h.01c6.54 0 11.84-5.3 11.84-11.84 0-3.16-1.23-6.14-3.37-8.56zM12.05 21.6a9.76 9.76 0 01-4.96-1.36l-.36-.21-3.88 1.02 1.04-3.78-.23-.39A9.73 9.73 0 012.37 11.84c0-5.37 4.38-9.74 9.68-9.74 2.59 0 5.03 1.01 6.86 2.85a9.65 9.65 0 012.86 6.9c0 5.36-4.38 9.75-9.72 9.75z"/>'
    '<path d="M17.4 14.4c-.3-.15-1.73-.86-2-.96-.27-.1-.47-.15-.67.15-.2.3-.76.96-.93 1.16-.17.2-.34.22-.63.07-.3-.15-1.26-.46-2.4-1.47-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.45.13-.6.14-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5s1.06 2.9 1.21 3.1c.15.2 2.1 3.2 5.08 4.5.71.3 1.26.48 1.69.62.71.22 1.35.19 1.86.12.57-.08 1.73-.7 1.97-1.38.25-.68.25-1.26.17-1.38-.07-.12-.27-.2-.57-.35z"/></svg>'
)


def _social_handle(value) -> str:
    """'@luna', 'luna' or 'https://instagram.com/luna/' -> 'luna'."""
    v = re.sub(r"^https?://(www\.)?[^/]+/", "", (value or "").strip(), flags=re.I)
    return re.sub(r"[/?#].*$", "", v).lstrip("@")


@api_router.get("/public/catalog/{bid}")
async def public_catalog(bid: str, request: Request):
    biz = await db.businesses.find_one({"id": bid}, {"_id": 0})
    if not biz:
        raise HTTPException(404, "Catálogo no encontrado")
    products = await db.products.find({"business_id": bid}, {"_id": 0}).sort("created_at", -1).to_list(500)

    e = _html_escape
    base = str(request.base_url).rstrip("/")
    color = biz.get("color") or ""
    brand = color if re.fullmatch(r"#[0-9a-fA-F]{6}", color) else DEFAULT_CATALOG_COLOR
    name = (biz.get("name") or "").strip() or "Catálogo"
    subtitle = (biz.get("subtitle") or "").strip()
    phone = (biz.get("phone") or "").strip()
    phone_digits = "".join(c for c in phone if c.isdigit())
    email = (biz.get("email") or "").strip()
    address = (biz.get("address") or "").strip()
    website = re.sub(r"^https?://", "", (biz.get("website") or "").strip(), flags=re.I).rstrip("/")
    ig, fb, tt = (_social_handle(biz.get(k)) for k in ("instagram", "facebook", "tiktok"))
    currency_sym = "$" if (biz.get("currency") or "").upper() == "USD" else "L "
    logo = _resolve_photo(biz.get("logo") or "", base)

    # Same order as the PDF: categories alphabetically, uncategorized last, newest first inside each.
    def cat_of(p) -> str:
        return (p.get("category") or "").strip()

    categories = sorted({cat_of(p) for p in products} - {""}, key=str.casefold)
    rank = {c: i for i, c in enumerate(categories)}
    products.sort(key=lambda p: rank.get(cat_of(p), len(categories)))

    def wa_link(text: str) -> str:
        return f"https://wa.me/{phone_digits}?text={quote(text)}" if phone_digits else f"https://wa.me/?text={quote(text)}"

    def card(p) -> str:
        photo = _resolve_photo((p.get("photos") or [""])[0], base)
        pname = (p.get("name") or "").strip()
        cat = cat_of(p)
        sku = (p.get("sku") or "").strip()
        ref = f"Referencia: {sku}" if sku else cat
        detail = (p.get("material") or "").strip() or (cat if sku else "")
        price = f"{currency_sym}{float(p.get('sale_price') or 0):,.2f}"
        sold_out = (p.get("stock") or 0) <= 0
        # Pieces with quotes are built first: Python 3.11 (Render) can't nest them inside the f-string.
        img = f'<img src="{e(photo)}" alt="{e(pname)}" loading="lazy">' if photo else f"<span>{e(pname[:1].upper())}</span>"
        out_attr = ' data-out="1"' if sold_out else ""
        out_tag = '<span class="out">Agotado</span>' if sold_out else ""
        order = e(wa_link(f"Hola, quiero pedir: {pname} ({price})."))
        desc = e(p.get("description"))
        return f"""
<article class="card" data-cat="{e(cat.casefold())}" data-photo="{e(photo)}" data-name="{e(pname)}" data-ref="{e(ref)}"
  data-detail="{e(detail)}" data-desc="{desc}" data-price="{e(price)}"{out_attr}>
  <div class="photo">{img}</div>
  <h2>{e(pname)}</h2>
  <div class="meta">
    <p class="ref">{e(ref)}</p>
    <p class="detail">{e(detail)}</p>
    <p class="price"><u>{e(price)}</u>{out_tag}</p>
    <a class="order" href="{order}" target="_blank" rel="noopener">{_WA_ICON}Pedir</a>
  </div>
</article>"""

    if len(categories) > 1:
        buttons = ['<button class="cat on" data-cat="*">Todos</button>'] + [
            f'<button class="cat" data-cat="{e(c.casefold())}">{e(c)}</button>' for c in categories
        ]
        cats_html = f'<nav class="cats">{"<span class=sep>|</span>".join(buttons)}</nav>'
    elif categories:
        cats_html = f'<p class="cats"><span class="cat">{e(categories[0])}</span></p>'
    else:
        cats_html = ""

    # The most useful link goes in the button at the foot; the other contact details above it.
    if website:
        pill = f'<a class="pill" href="https://{e(website)}" target="_blank" rel="noopener">{e(website)}</a>'
    elif ig:
        pill = f'<a class="pill" href="https://instagram.com/{e(ig)}" target="_blank" rel="noopener">@{e(ig)}</a>'
    elif phone_digits:
        pill = f'<a class="pill" href="https://wa.me/{phone_digits}" target="_blank" rel="noopener">Pedidos: {e(phone)}</a>'
    else:
        pill = ""
    contacts = []
    if phone and (website or ig or not phone_digits):
        contacts.append(f'<a href="https://wa.me/{phone_digits}" target="_blank" rel="noopener">Tel. / WhatsApp {e(phone)}</a>' if phone_digits else e(phone))
    if email:
        contacts.append(f'<a href="mailto:{e(email)}">{e(email)}</a>')
    if ig and website:
        contacts.append(f'<a href="https://instagram.com/{e(ig)}" target="_blank" rel="noopener">Instagram @{e(ig)}</a>')
    if fb:
        contacts.append(f'<a href="https://facebook.com/{e(fb)}" target="_blank" rel="noopener">Facebook {e(fb)}</a>')
    if tt:
        contacts.append(f'<a href="https://www.tiktok.com/@{e(tt)}" target="_blank" rel="noopener">TikTok @{e(tt)}</a>')
    if address:
        contacts.append(f"<span>{e(address)}</span>")

    first_photo = next((_resolve_photo(p["photos"][0], base) for p in products if p.get("photos")), "")
    preview_image = logo or first_photo
    cards_html = "".join(card(p) for p in products) or '<p class="empty">Aún no hay productos en el catálogo.</p>'
    css = _CATALOG_CSS.replace("__BRAND__", brand).replace("__GRAIN__", _CATALOG_GRAIN)
    tagline = e(subtitle or "Catálogo de productos")
    og_image = f'<meta property="og:image" content="{e(preview_image)}">' if preview_image else ""
    logo_html = f'<img src="{e(logo)}" alt="">' if logo else f"<span>{e(name[:1].upper())}</span>"
    contacts_html = f'<div class="contacts">{"".join(contacts)}</div>' if contacts else ""

    html = f"""<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(name)} · Catálogo</title>
<meta property="og:title" content="{e(name)} · Catálogo">
<meta property="og:description" content="{tagline}">
{og_image}
<meta name="theme-color" content="{brand}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>{css}</style>
</head><body>
<header>
  <div class="logo">{logo_html}</div>
  <h1>{e(name)}</h1>
  <p class="tagline">{tagline}</p>
  {cats_html}
</header>
<main>
  <div class="grid">{cards_html}<p class="empty" id="emptyFilter" style="display:none">No hay productos en esta categoría.</p></div>
</main>
<footer>
  {contacts_html}
  {pill}
  <p class="credit">Catálogo creado con Mis Negocios</p>
</footer>
<div class="modal" id="modal" role="dialog" aria-modal="true">
  <div class="sheet">
    <button class="close" id="mclose" aria-label="Cerrar">×</button>
    <img id="mimg" src="" alt="">
    <div class="sbody">
      <h3 id="mname"></h3>
      <p class="ref" id="mref"></p>
      <p class="detail" id="mdetail"></p>
      <p class="sdesc" id="mdesc"></p>
      <p class="price"><u id="mprice"></u><span class="out" id="mout">Agotado</span></p>
      <a class="order" id="morder" target="_blank" rel="noopener">{_WA_ICON}Pedir por WhatsApp</a>
    </div>
  </div>
</div>
<script>{_CATALOG_JS}</script>
</body></html>"""
    return Response(content=html, media_type="text/html; charset=utf-8")


# ---------------- Files ----------------
ALLOWED_UPLOAD_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
    "application/pdf",
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB; must stay below MongoDB's 16 MB document limit


def _ext_from_mime(mime: str) -> str:
    return {
        "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
        "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
        "application/pdf": "pdf",
    }.get(mime, "bin")


@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Archivo demasiado grande (máx 10 MB)")
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(400, f"Tipo de archivo no soportado: {mime}")
    ext = _ext_from_mime(mime)
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await db.files.insert_one({
            "path": path,
            "user_id": user["user_id"],
            "size": len(content),
            "content_type": mime,
            "data": content,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        logger.exception("upload failed")
        raise HTTPException(502, "No se pudo guardar el archivo en el servidor. Intenta de nuevo.")
    return {"path": path, "url": f"/api/files/{path}"}


@api_router.get("/files/{file_path:path}")
async def get_file(file_path: str):
    # Public read for product/catalog display
    doc = await db.files.find_one({"path": file_path}, {"_id": 0, "data": 1, "content_type": 1})
    if not doc or doc.get("data") is None:
        raise HTTPException(404, "Archivo no encontrado")
    return Response(
        content=bytes(doc["data"]),
        media_type=doc.get("content_type") or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


# ---------------- AI (Gemini, see gemini_generate) ----------------
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
    ctx = await build_business_context(bid)
    system = (
        "Eres un asistente de negocios experto que ayuda a dueños de pequeños negocios. "
        "Responde SIEMPRE en español, de forma clara, concisa y accionable. "
        "Usa viñetas cuando listes recomendaciones. No inventes datos que no estén en el contexto.\n\n"
        f"Contexto del negocio activo:\n{ctx}"
    )
    # Gemini wants turns that start with "user" and alternate; merge consecutive same-role messages.
    contents: list[dict] = []
    turns = [(m.get("role"), (m.get("content") or "").strip()) for m in (data.history or [])[-10:]]
    for role, text in turns + [("user", data.message.strip())]:
        if not text:
            continue
        g_role = "user" if role == "user" else "model"
        if not contents and g_role == "model":
            continue
        if contents and contents[-1]["role"] == g_role:
            contents[-1]["parts"][0]["text"] += "\n\n" + text
        else:
            contents.append({"role": g_role, "parts": [{"text": text}]})
    if not contents:
        raise HTTPException(400, "Escribe un mensaje")
    return {"reply": await gemini_generate(system, contents)}


@api_router.post("/businesses/{bid}/ai/product-description")
async def ai_product_description(bid: str, data: AIDescIn, user: dict = Depends(get_current_user)):
    await require_business(bid, user)
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
    description = await gemini_generate(system, [{"role": "user", "parts": [{"text": prompt}]}])
    return {"description": description}


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
