from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'cromofutbol')]

app = FastAPI(title="CromoFutbol Tenerife API")
api = APIRouter(prefix="/api")

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me-in-prod-cromofutbol-2026')
JWT_ALG = "HS256"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

bearer_scheme = HTTPBearer(auto_error=False)

async def get_current_user(request: Request, creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    token = creds.credentials if creds and creds.credentials else None
    if not token:
        token = request.cookies.get("cf_token")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

PW_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$")
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_]{3,20}$")


class RegisterIn(BaseModel):
    email: EmailStr
    username: str
    password: str

class LoginIn(BaseModel):
    identifier: str
    password: str

class ProfileIn(BaseModel):
    display_name: str
    club: str = ""
    category: str = ""
    phone: str = ""
    city_zone: str = ""
    bio: str = ""
    own_player_name: str = ""  # El nombre del jugador propio del niño (para cromos especiales)

class CollectionIn(BaseModel):
    name: str
    season: str
    total_cards: int = 0
    description: str = ""

class CardIn(BaseModel):
    collection_id: str
    number: int
    player_name: str = ""
    card_type: Literal["normal", "ballondor", "special"] = "normal"

class EntryIn(BaseModel):
    collection_id: str
    card_id: str
    entry_type: Literal["busco", "repetido"]
    quantity: int = 1
    notes: str = ""

class ExchangeCreateIn(BaseModel):
    receiver_id: str
    requested_entry_ids: List[str] = []        # Cromos que pides del receptor
    offered_entry_ids: List[str] = []          # Cromos que ofreces al receptor
    # Compatibilidad con frontend antiguo desplegado:
    requested_entry_id: Optional[str] = None
    offered_entry_id: Optional[str] = None
    message: str = ""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())


@api.post("/auth/register")
async def register(data: RegisterIn):
    if not PW_REGEX.match(data.password):
        raise HTTPException(status_code=400, detail="Contraseña: 6+ chars, mayúscula, minúscula y número.")
    if not USERNAME_REGEX.match(data.username):
        raise HTTPException(status_code=400, detail="Usuario: 3-20 caracteres alfanuméricos.")
    email = data.email.lower().strip()
    username = data.username.strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email ya registrado.")
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Usuario ya existe.")
    uid = new_id()
    await db.users.insert_one({
        "id": uid, "email": email, "username": username,
        "password_hash": hash_password(data.password),
        "role": "user", "created_at": now_iso(),
    })
    await db.profiles.insert_one({
        "user_id": uid, "display_name": username, "club": "", "category": "",
        "phone": "", "city_zone": "", "bio": "", "profile_completed": False,
        "updated_at": now_iso(),
    })
    token = create_access_token(uid)
    return {"token": token, "user": {"id": uid, "email": email, "username": username, "role": "user"}}


@api.post("/auth/login")
async def login(data: LoginIn):
    ident = data.identifier.strip().lower()
    user = await db.users.find_one({"$or": [{"email": ident}, {"username": data.identifier.strip()}]})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas.")
    token = create_access_token(user["id"])
    return {"token": token, "user": {k: v for k, v in user.items() if k not in ("_id", "password_hash")}}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    profile = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"user": user, "profile": profile}


@api.put("/profile/me")
async def update_profile(data: ProfileIn, user: dict = Depends(get_current_user)):
    if not data.display_name.strip():
        raise HTTPException(status_code=400, detail="Nombre obligatorio.")
    upd = data.model_dump()
    upd["profile_completed"] = True
    upd["updated_at"] = now_iso()
    await db.profiles.update_one({"user_id": user["id"]}, {"$set": upd})
    return await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})


@api.get("/collections")
async def list_collections(user: dict = Depends(get_current_user)):
    # Users see approved + own (any status). Admins see all.
    if user.get("role") == "admin":
        q = {}
    else:
        q = {"$or": [{"status": "approved"}, {"created_by": user["id"]}]}
    items = await db.collections.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api.post("/collections")
async def create_collection(data: CollectionIn, user: dict = Depends(get_current_user)):
    if not data.name.strip() or not data.season.strip():
        raise HTTPException(status_code=400, detail="Nombre y temporada obligatorios.")
    if await db.collections.find_one({"name": data.name.strip(), "season": data.season.strip()}):
        raise HTTPException(status_code=400, detail="Ya existe esa colección.")
    # Admins crean directamente aprobadas; users normales pasan a "pending" para revisión
    status = "approved" if user.get("role") == "admin" else "pending"
    doc = {**data.model_dump(), "id": new_id(), "created_by": user["id"],
           "status": status, "created_at": now_iso()}
    await db.collections.insert_one(doc)
    # Notificar a admins si es pending
    if status == "pending":
        admins = await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(50)
        for a in admins:
            await db.notifications.insert_one({
                "id": new_id(), "user_id": a["id"], "type": "collection_pending",
                "title": "Colección pendiente", "message": f"{doc['name']} · {doc['season']}",
                "related_exchange_id": None, "read": False, "created_at": now_iso(),
            })
    doc.pop("_id", None)
    return doc


@api.get("/cards")
async def list_cards(collection_id: str, user: dict = Depends(get_current_user)):
    return await db.cards.find({"collection_id": collection_id}, {"_id": 0}).sort("number", 1).to_list(5000)


@api.post("/cards")
async def create_card(data: CardIn, user: dict = Depends(get_current_user)):
    col = await db.collections.find_one({"id": data.collection_id})
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    if data.number < 0:
        raise HTTPException(status_code=400, detail="Número inválido.")
    # For special/ballondor cards without number (number=0), dedupe by (collection, type, player_name).
    # For normal cards, dedupe by (collection, type, number).
    if data.card_type != "normal" and data.number == 0:
        if not data.player_name.strip():
            raise HTTPException(status_code=400, detail="Para cromos especiales indica el nombre del jugador.")
        existing = await db.cards.find_one({
            "collection_id": data.collection_id,
            "card_type": data.card_type,
            "player_name": data.player_name.strip(),
        })
    else:
        existing = await db.cards.find_one({
            "collection_id": data.collection_id,
            "number": data.number,
            "card_type": data.card_type,
        })
    if existing:
        existing.pop("_id", None)
        return existing
    doc = {**data.model_dump(), "id": new_id(), "created_at": now_iso()}
    doc["player_name"] = doc.get("player_name", "").strip()
    await db.cards.insert_one(doc)
    doc.pop("_id", None)
    return doc


class BulkEntryIn(BaseModel):
    collection_id: str
    entry_type: Literal["busco", "repetido"]
    numbers: List[int] = []                # Lista de números para cromos normales
    specials: List[dict] = []              # Lista de {player_name, card_type} para especiales
    quantity: int = 1                      # Cantidad (para repetidos)


@api.post("/entries/bulk")
async def create_entries_bulk(data: BulkEntryIn, user: dict = Depends(get_current_user)):
    col = await db.collections.find_one({"id": data.collection_id})
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    if not data.numbers and not data.specials:
        raise HTTPException(status_code=400, detail="Selecciona al menos un cromo.")
    if len(data.numbers) + len(data.specials) > 500:
        raise HTTPException(status_code=400, detail="Máximo 500 cromos por operación.")
    qty = max(1, int(data.quantity))
    if data.entry_type == "busco":
        qty = 1

    created, skipped, errors = 0, 0, []

    async def upsert_card(number: int, card_type: str, player_name: str = "") -> Optional[str]:
        if card_type != "normal" and number == 0:
            existing = await db.cards.find_one({"collection_id": data.collection_id, "card_type": card_type, "player_name": player_name.strip()})
        else:
            existing = await db.cards.find_one({"collection_id": data.collection_id, "number": number, "card_type": card_type})
        if existing:
            return existing["id"]
        cid = new_id()
        await db.cards.insert_one({
            "id": cid, "collection_id": data.collection_id, "number": number,
            "player_name": player_name.strip(), "card_type": card_type, "created_at": now_iso(),
        })
        return cid

    async def upsert_entry(card_id: str):
        nonlocal created, skipped
        opp = "repetido" if data.entry_type == "busco" else "busco"
        if await db.user_card_entries.find_one({"user_id": user["id"], "card_id": card_id, "entry_type": opp, "status": {"$in": ["active", "pending"]}}):
            skipped += 1
            return
        dup = await db.user_card_entries.find_one({"user_id": user["id"], "card_id": card_id, "entry_type": data.entry_type, "status": {"$in": ["active", "pending"]}})
        if dup:
            if data.entry_type == "repetido":
                await db.user_card_entries.update_one({"id": dup["id"]}, {"$set": {"quantity": dup.get("quantity", 1) + qty, "updated_at": now_iso()}})
                created += 1
            else:
                skipped += 1
            return
        await db.user_card_entries.insert_one({
            "id": new_id(), "user_id": user["id"], "collection_id": data.collection_id,
            "card_id": card_id, "entry_type": data.entry_type, "status": "active",
            "quantity": qty, "notes": "",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        created += 1

    # Normales
    for n in data.numbers:
        try:
            cid = await upsert_card(int(n), "normal")
            if cid:
                await upsert_entry(cid)
        except Exception as e:
            errors.append(f"#{n}: {str(e)[:60]}")

    # Especiales
    for sp in data.specials:
        try:
            pname = (sp.get("player_name") or "").strip()
            ctype = sp.get("card_type", "special")
            if ctype not in ("ballondor", "special"):
                ctype = "special"
            if not pname:
                errors.append("Especial sin nombre: ignorado")
                continue
            cid = await upsert_card(0, ctype, pname)
            if cid:
                await upsert_entry(cid)
        except Exception as e:
            errors.append(f"{sp.get('player_name','?')}: {str(e)[:60]}")

    return {"created": created, "skipped": skipped, "errors": errors[:20]}


async def _entry_view(e: dict) -> dict:
    card = await db.cards.find_one({"id": e["card_id"]}, {"_id": 0}) or {}
    col = await db.collections.find_one({"id": e["collection_id"]}, {"_id": 0}) or {}
    return {**e, "card": card, "collection": col}


@api.get("/entries/me")
async def my_entries(user: dict = Depends(get_current_user), entry_type: Optional[str] = None):
    q = {"user_id": user["id"], "status": {"$in": ["active", "pending"]}}
    if entry_type in ("busco", "repetido"):
        q["entry_type"] = entry_type
    entries = await db.user_card_entries.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [await _entry_view(e) for e in entries]


@api.post("/entries")
async def create_entry(data: EntryIn, user: dict = Depends(get_current_user)):
    if data.quantity < 1:
        raise HTTPException(status_code=400, detail="Cantidad inválida.")
    if data.entry_type == "busco" and data.quantity != 1:
        data.quantity = 1
    card = await db.cards.find_one({"id": data.card_id})
    if not card:
        raise HTTPException(status_code=404, detail="Cromo no encontrado")
    opp = "repetido" if data.entry_type == "busco" else "busco"
    if await db.user_card_entries.find_one({"user_id": user["id"], "card_id": data.card_id, "entry_type": opp, "status": {"$in": ["active", "pending"]}}):
        raise HTTPException(status_code=400, detail=f"Ya tienes este cromo en '{opp}'.")
    dup = await db.user_card_entries.find_one({"user_id": user["id"], "card_id": data.card_id, "entry_type": data.entry_type, "status": {"$in": ["active", "pending"]}})
    if dup:
        if data.entry_type == "repetido":
            await db.user_card_entries.update_one({"id": dup["id"]}, {"$set": {"quantity": dup.get("quantity", 1) + data.quantity, "updated_at": now_iso()}})
            updated = await db.user_card_entries.find_one({"id": dup["id"]}, {"_id": 0})
            return await _entry_view(updated)
        raise HTTPException(status_code=400, detail="Ya tienes esta entrada.")
    doc = {
        "id": new_id(), "user_id": user["id"], "collection_id": data.collection_id,
        "card_id": data.card_id, "entry_type": data.entry_type, "status": "active",
        "quantity": data.quantity, "notes": data.notes,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.user_card_entries.insert_one(doc)
    doc.pop("_id", None)
    return await _entry_view(doc)


@api.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, user: dict = Depends(get_current_user)):
    e = await db.user_card_entries.find_one({"id": entry_id})
    if not e or e["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="No encontrada")
    if e.get("status") == "pending":
        raise HTTPException(status_code=400, detail="En intercambio pendiente.")
    await db.user_card_entries.update_one({"id": entry_id}, {"$set": {"status": "removed", "updated_at": now_iso()}})
    return {"ok": True}


@api.get("/matches")
async def matches(user: dict = Depends(get_current_user)):
    my_busco = await db.user_card_entries.find({"user_id": user["id"], "entry_type": "busco", "status": "active"}, {"_id": 0}).to_list(500)
    my_rep = await db.user_card_entries.find({"user_id": user["id"], "entry_type": "repetido", "status": "active"}, {"_id": 0}).to_list(500)
    busco_ids = [e["card_id"] for e in my_busco]
    rep_ids = [e["card_id"] for e in my_rep]
    others_rep = await db.user_card_entries.find({"user_id": {"$ne": user["id"]}, "entry_type": "repetido", "status": "active", "card_id": {"$in": busco_ids}}, {"_id": 0}).to_list(1000) if busco_ids else []
    others_busco = await db.user_card_entries.find({"user_id": {"$ne": user["id"]}, "entry_type": "busco", "status": "active", "card_id": {"$in": rep_ids}}, {"_id": 0}).to_list(1000) if rep_ids else []
    user_ids = list({*[e["user_id"] for e in others_rep], *[e["user_id"] for e in others_busco]})
    if not user_ids:
        return []
    profs = await db.profiles.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(1000)
    pmap = {p["user_id"]: p for p in profs}

    async def enrich(items):
        out = []
        for e in items:
            out.append(await _entry_view(e))
        return out

    rep_v = await enrich(others_rep)
    bus_v = await enrich(others_busco)
    res = []
    for uid in user_ids:
        p = pmap.get(uid, {})
        their_rep = [e for e in rep_v if e["user_id"] == uid]
        their_bus = [e for e in bus_v if e["user_id"] == uid]
        is_cross = bool(their_rep and their_bus)
        res.append({
            "user_id": uid,
            "display_name": p.get("display_name", ""),
            "club": p.get("club", ""),
            "they_have_you_want": their_rep,
            "they_want_you_have": their_bus,
            "cross_match": is_cross,
            "priority": (1000 if is_cross else 0) + len(their_rep) * 10,
        })
    res.sort(key=lambda x: x["priority"], reverse=True)
    return res


@api.post("/exchanges")
async def create_exchange(data: ExchangeCreateIn, user: dict = Depends(get_current_user)):
    if data.receiver_id == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes pedírtelo a ti mismo.")

    # Mezclar campos antiguos (singular) con nuevos (lista) para compatibilidad
    requested_ids = list(data.requested_entry_ids or [])
    if data.requested_entry_id and data.requested_entry_id not in requested_ids:
        requested_ids.append(data.requested_entry_id)
    offered_ids = list(data.offered_entry_ids or [])
    if data.offered_entry_id and data.offered_entry_id not in offered_ids:
        offered_ids.append(data.offered_entry_id)

    if not requested_ids and not offered_ids:
        raise HTTPException(status_code=400, detail="Selecciona al menos un cromo.")
    if len(requested_ids) > 50 or len(offered_ids) > 50:
        raise HTTPException(status_code=400, detail="Máximo 50 cromos por intercambio.")

    # Validar entradas pedidas (deben ser del receptor y tipo repetido)
    for eid in requested_ids:
        e = await db.user_card_entries.find_one({"id": eid})
        if not e or e["user_id"] != data.receiver_id or e["entry_type"] != "repetido":
            raise HTTPException(status_code=400, detail="Cromo solicitado inválido.")
    # Validar entradas ofrecidas (deben ser del usuario actual y tipo repetido)
    for eid in offered_ids:
        e = await db.user_card_entries.find_one({"id": eid})
        if not e or e["user_id"] != user["id"] or e["entry_type"] != "repetido":
            raise HTTPException(status_code=400, detail="Cromo ofrecido inválido.")

    # Permitir múltiples solicitudes pendientes con el mismo usuario (eliminado el bloqueo previo)
    ex_id = new_id()
    await db.exchange_requests.insert_one({
        "id": ex_id, "requester_id": user["id"], "receiver_id": data.receiver_id,
        "status": "pending", "message": data.message, "contact_unlocked": False,
        "requested_entry_ids": requested_ids,
        "offered_entry_ids": offered_ids,
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.notifications.insert_one({
        "id": new_id(), "user_id": data.receiver_id, "type": "exchange_request",
        "title": "Nueva solicitud", "message": f"{user['username']} quiere intercambiar contigo ({len(requested_ids)} pide / {len(offered_ids)} ofrece).",
        "related_exchange_id": ex_id, "read": False, "created_at": now_iso(),
    })
    return {"ok": True, "exchange_id": ex_id}


async def _exchange_view(ex: dict, viewer_id: str) -> dict:
    other_id = ex["receiver_id"] if ex["requester_id"] == viewer_id else ex["requester_id"]
    other_p = await db.profiles.find_one({"user_id": other_id}, {"_id": 0}) or {}
    other_u = await db.users.find_one({"id": other_id}, {"_id": 0, "password_hash": 0}) or {}

    # Compatibilidad: leer tanto los campos nuevos en lista como los antiguos individuales
    req_ids = ex.get("requested_entry_ids")
    if req_ids is None and ex.get("requested_entry_id"):
        req_ids = [ex["requested_entry_id"]]
    req_ids = req_ids or []
    off_ids = ex.get("offered_entry_ids")
    if off_ids is None and ex.get("offered_entry_id"):
        off_ids = [ex["offered_entry_id"]]
    off_ids = off_ids or []

    requested_views = []
    for eid in req_ids:
        e = await db.user_card_entries.find_one({"id": eid}, {"_id": 0})
        if e:
            requested_views.append(await _entry_view(e))
    offered_views = []
    for eid in off_ids:
        e = await db.user_card_entries.find_one({"id": eid}, {"_id": 0})
        if e:
            offered_views.append(await _entry_view(e))

    contact = None
    if ex.get("contact_unlocked") and ex["status"] in ("accepted", "completed"):
        contact = {"phone": other_p.get("phone", ""), "email": other_u.get("email", "")}
    return {
        **ex,
        "other": {"user_id": other_id, "username": other_u.get("username", ""), "display_name": other_p.get("display_name", "")},
        "requested_items": requested_views,
        "offered_items": offered_views,
        # Mantener campos antiguos por compatibilidad con frontend ya desplegado
        "requested": requested_views[0] if requested_views else None,
        "offered": offered_views[0] if offered_views else None,
        "contact": contact,
    }


@api.get("/exchanges")
async def list_exchanges(user: dict = Depends(get_current_user)):
    q = {"$or": [{"requester_id": user["id"]}, {"receiver_id": user["id"]}]}
    exs = await db.exchange_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _exchange_view(e, user["id"]) for e in exs]


@api.post("/exchanges/{exchange_id}/accept")
async def accept_ex(exchange_id: str, user: dict = Depends(get_current_user)):
    ex = await db.exchange_requests.find_one({"id": exchange_id})
    if not ex or ex["receiver_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="No encontrado")
    if ex["status"] != "pending":
        raise HTTPException(status_code=400, detail="No está pendiente.")
    await db.exchange_requests.update_one({"id": exchange_id}, {"$set": {"status": "accepted", "contact_unlocked": True, "updated_at": now_iso()}})
    await db.notifications.insert_one({
        "id": new_id(), "user_id": ex["requester_id"], "type": "exchange_accepted",
        "title": "¡Aceptado!", "message": "Ya puedes ver el contacto.",
        "related_exchange_id": exchange_id, "read": False, "created_at": now_iso(),
    })
    return {"ok": True}


@api.post("/exchanges/{exchange_id}/reject")
async def reject_ex(exchange_id: str, user: dict = Depends(get_current_user)):
    ex = await db.exchange_requests.find_one({"id": exchange_id})
    if not ex or ex["receiver_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="No encontrado")
    await db.exchange_requests.update_one({"id": exchange_id}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
    return {"ok": True}


@api.get("/notifications")
async def notifs(user: dict = Depends(get_current_user)):
    return await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/notifications/read-all")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    busco = await db.user_card_entries.count_documents({"user_id": user["id"], "entry_type": "busco", "status": "active"})
    rep = await db.user_card_entries.count_documents({"user_id": user["id"], "entry_type": "repetido", "status": "active"})
    pending = await db.exchange_requests.count_documents({"$or": [{"requester_id": user["id"]}, {"receiver_id": user["id"]}], "status": {"$in": ["pending", "accepted"]}})
    received = await db.exchange_requests.count_documents({"receiver_id": user["id"], "status": "pending"})
    unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"busco_count": busco, "repetido_count": rep, "pending_exchanges": pending, "received_requests": received, "unread_notifications": unread}


async def seed_admin():
    email = os.environ.get("ADMIN_EMAIL", "admin@cromofutbol.es").lower()
    password = os.environ.get("ADMIN_PASSWORD", "Admin123")
    existing = await db.users.find_one({"email": email})
    if not existing:
        uid = new_id()
        await db.users.insert_one({
            "id": uid, "email": email, "username": "admin",
            "password_hash": hash_password(password), "role": "admin",
            "created_at": now_iso(),
        })
        await db.profiles.insert_one({
            "user_id": uid, "display_name": "Administrador", "club": "CromoFútbol", "category": "Admin",
            "phone": "", "city_zone": "", "bio": "", "profile_completed": True, "updated_at": now_iso(),
        })


# =========================================================
# ADMIN
# =========================================================
async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores.")
    return user


@api.get("/admin/overview")
async def admin_overview(admin: dict = Depends(require_admin)):
    return {
        "pending_collections": await db.collections.count_documents({"status": "pending"}),
        "approved_collections": await db.collections.count_documents({"status": "approved"}),
        "rejected_collections": await db.collections.count_documents({"status": "rejected"}),
        "total_users": await db.users.count_documents({}),
        "completed_exchanges": await db.exchange_requests.count_documents({"status": "completed"}),
        "pending_exchanges": await db.exchange_requests.count_documents({"status": "pending"}),
    }


@api.get("/admin/collections")
async def admin_list_collections(admin: dict = Depends(require_admin), status_filter: Optional[str] = None):
    q = {}
    if status_filter in ("pending", "approved", "rejected"):
        q["status"] = status_filter
    items = await db.collections.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    creator_ids = list({c.get("created_by") for c in items if c.get("created_by")})
    creators = await db.users.find({"id": {"$in": creator_ids}}, {"_id": 0, "id": 1, "username": 1, "email": 1}).to_list(500) if creator_ids else []
    cmap = {c["id"]: c for c in creators}
    return [{**it, "creator": cmap.get(it.get("created_by"))} for it in items]


@api.post("/admin/collections/{collection_id}/approve")
async def admin_approve_collection(collection_id: str, admin: dict = Depends(require_admin)):
    col = await db.collections.find_one({"id": collection_id})
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    await db.collections.update_one({"id": collection_id}, {"$set": {"status": "approved", "updated_at": now_iso()}})
    if col.get("created_by") and col["created_by"] != admin["id"]:
        await db.notifications.insert_one({
            "id": new_id(), "user_id": col["created_by"], "type": "collection_approved",
            "title": "Colección aprobada",
            "message": f"Tu colección «{col['name']}» ha sido aprobada y ya es pública.",
            "related_exchange_id": None, "read": False, "created_at": now_iso(),
        })
    return {"ok": True}


@api.post("/admin/collections/{collection_id}/reject")
async def admin_reject_collection(collection_id: str, admin: dict = Depends(require_admin)):
    col = await db.collections.find_one({"id": collection_id})
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    await db.collections.update_one({"id": collection_id}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
    if col.get("created_by"):
        await db.notifications.insert_one({
            "id": new_id(), "user_id": col["created_by"], "type": "collection_rejected",
            "title": "Colección rechazada",
            "message": f"Tu colección «{col['name']}» ha sido rechazada.",
            "related_exchange_id": None, "read": False, "created_at": now_iso(),
        })
    return {"ok": True}


@api.put("/admin/collections/{collection_id}")
async def admin_update_collection(collection_id: str, data: CollectionIn, admin: dict = Depends(require_admin)):
    col = await db.collections.find_one({"id": collection_id})
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    upd = {**data.model_dump(), "updated_at": now_iso()}
    await db.collections.update_one({"id": collection_id}, {"$set": upd})
    updated = await db.collections.find_one({"id": collection_id}, {"_id": 0})
    return updated


@api.delete("/admin/collections/{collection_id}")
async def admin_delete_collection(collection_id: str, admin: dict = Depends(require_admin)):
    await db.collections.delete_one({"id": collection_id})
    await db.cards.delete_many({"collection_id": collection_id})
    return {"ok": True}


@api.post("/admin/collections")
async def admin_create_collection(data: CollectionIn, admin: dict = Depends(require_admin)):
    if not data.name.strip() or not data.season.strip():
        raise HTTPException(status_code=400, detail="Nombre y temporada obligatorios.")
    if await db.collections.find_one({"name": data.name.strip(), "season": data.season.strip()}):
        raise HTTPException(status_code=400, detail="Ya existe esa colección.")
    doc = {**data.model_dump(), "id": new_id(), "created_by": admin["id"],
           "status": "approved", "created_at": now_iso()}
    await db.collections.insert_one(doc)
    doc.pop("_id", None)
    return doc


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.users.create_index("id", unique=True)
    await db.profiles.create_index("user_id", unique=True)
    await seed_admin()


@api.get("/")
async def root():
    return {"ok": True, "service": "cromofutbol-api"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# =========================================================
# AI: Extracción de listas/cromos desde imagen
# =========================================================
class ExtractListIn(BaseModel):
    image_base64: str                # data: prefix permitido o solo base64
    mode: Literal["lista", "cromos"] = "lista"  # lista=hoja escrita, cromos=foto de cromos


@api.post("/ai/extract-list")
async def ai_extract_list(data: ExtractListIn, user: dict = Depends(get_current_user)):
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY no configurada")

    img = data.image_base64.strip()
    if "," in img and img.startswith("data:"):
        img = img.split(",", 1)[1]
    if not img:
        raise HTTPException(status_code=400, detail="Imagen vacía")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"emergentintegrations no disponible: {e}")

    if data.mode == "cromos":
        sys_msg = (
            "Eres un asistente que extrae datos de fotos de cromos de fútbol. "
            "Identifica los cromos visibles en la imagen y devuelve los datos. "
            "Para cromos con número visible, devuelve el número. "
            "Para cromos especiales sin número (Balón de Oro, Especiales) o donde el número no sea legible, "
            "devuelve solo el nombre del jugador. "
            "Responde EXCLUSIVAMENTE con JSON válido, nada de texto extra, ni markdown, ni ```. "
            "Formato: {\"numbers\":[1,2,3],\"specials\":[{\"player_name\":\"Lamine Yamal\",\"card_type\":\"ballondor\"}]} "
            "card_type debe ser 'ballondor' (premios/balón de oro/MVP) o 'special' (jugadores destacados sin número)."
        )
        user_text = "Extrae los números y nombres de jugadores especiales de los cromos en esta imagen."
    else:
        sys_msg = (
            "Eres un asistente que extrae listas de cromos de fútbol escritas a mano por niños. "
            "La hoja puede contener números (de 1 a 999) y/o nombres de jugadores especiales (Balón de Oro, "
            "MVP, jugadores destacados sin número como 'Lamine Yamal', 'Pedri', etc). "
            "Lee con tolerancia a la letra de niño. Si un nombre no es claramente legible, omítelo. "
            "Responde EXCLUSIVAMENTE con JSON válido, nada de texto extra, ni markdown, ni ```. "
            "Formato: {\"numbers\":[1,2,3],\"specials\":[{\"player_name\":\"Lamine Yamal\",\"card_type\":\"ballondor\"}]} "
            "card_type debe ser 'ballondor' (si está marcado como balón de oro/MVP/premio) o 'special'."
        )
        user_text = "Extrae todos los números y nombres de jugadores especiales de esta lista escrita a mano."

    chat = LlmChat(
        api_key=api_key,
        session_id=f"extract-{user['id']}-{uuid.uuid4().hex[:8]}",
        system_message=sys_msg,
    ).with_model("gemini", "gemini-2.5-flash")

    try:
        msg = UserMessage(text=user_text, file_contents=[ImageContent(image_base64=img)])
        response = await chat.send_message(msg)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error IA: {str(e)[:200]}")

    # Parsear JSON, tolerante a respuestas con markdown
    import json, re
    raw = (response or "").strip()
    # Quitar bloque markdown si lo hay
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        raw = m.group(1)
    else:
        m2 = re.search(r"\{.*\}", raw, re.DOTALL)
        if m2:
            raw = m2.group(0)
    try:
        parsed = json.loads(raw)
    except Exception:
        return {"numbers": [], "specials": [], "raw": response[:500], "warning": "No se pudo parsear la respuesta"}

    # Sanitizar
    numbers = []
    for n in parsed.get("numbers", []) or []:
        try:
            ni = int(n)
            if 0 < ni < 1000:
                numbers.append(ni)
        except Exception:
            pass
    specials = []
    for sp in parsed.get("specials", []) or []:
        if isinstance(sp, dict):
            name = (sp.get("player_name") or sp.get("name") or "").strip()
            ctype = sp.get("card_type", "special")
            if ctype not in ("ballondor", "special"):
                ctype = "special"
            if name:
                specials.append({"player_name": name, "card_type": ctype})
        elif isinstance(sp, str) and sp.strip():
            specials.append({"player_name": sp.strip(), "card_type": "special"})

    # Eliminar duplicados manteniendo orden
    numbers = sorted(set(numbers))
    seen = set()
    unique_specials = []
    for sp in specials:
        key = (sp["player_name"].lower(), sp["card_type"])
        if key not in seen:
            seen.add(key)
            unique_specials.append(sp)

    return {"numbers": numbers, "specials": unique_specials}


@app.get("/api/download/web-bundle")
async def download_web_bundle():
    from fastapi.responses import FileResponse
    path = ROOT_DIR / "cromofutbol-web.zip"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Bundle no disponible")
    return FileResponse(str(path), media_type="application/zip", filename="cromofutbol-web.zip")


app.include_router(api)

# CORS: using Bearer tokens (not cookies) so we can safely use "*" without credentials
_cors_origins_env = os.environ.get("CORS_ORIGINS", "*").strip()
_allow_origins = ["*"] if _cors_origins_env == "*" else [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO)
