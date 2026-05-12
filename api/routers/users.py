import os, uuid, hashlib, hmac, logging
from datetime import datetime
from typing import Literal

import pymongo
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])

ADMIN_EMAIL = "admin@bank.com"
_UserRole = Literal["l1", "l2", "admin"]
_HASH_ITERATIONS = 260_000  # PBKDF2-SHA256, NIST SP 800-132 minimum


def _hash_password(password: str, salt: str | None = None) -> dict:
    if salt is None:
        salt = uuid.uuid4().hex
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _HASH_ITERATIONS)
    return {"hash": key.hex(), "salt": salt}


def _verify_password(password: str, stored_hash: str, salt: str) -> bool:
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _HASH_ITERATIONS)
    return hmac.compare_digest(key.hex(), stored_hash)


class MongoUserStore:
    def __init__(self):
        uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        self.client = pymongo.MongoClient(uri)
        self.col = self.client["trace_db"]["users"]
        self.col.create_index("email", unique=True)
        self._seed_admin()

    def _seed_admin(self):
        if not self.col.find_one({"email": ADMIN_EMAIL}):
            pw = _hash_password("zUlqVAZ5wt")
            self.col.insert_one({
                "_id": ADMIN_EMAIL,
                "email": ADMIN_EMAIL,
                "name": "Admin",
                "role": "admin",
                "hash": pw["hash"],
                "salt": pw["salt"],
                "created_at": datetime.utcnow().isoformat(),
            })
            logger.info("Seeded default admin user")

    def authenticate(self, email: str, password: str) -> dict | None:
        doc = self.col.find_one({"email": email.lower()})
        if not doc:
            return None
        if "hash" not in doc or not _verify_password(password, doc["hash"], doc["salt"]):
            return None
        return {"email": doc["email"], "name": doc["name"], "role": doc["role"]}

    def list_users(self) -> list[dict]:
        return [{"email": d["email"], "name": d["name"], "role": d["role"]} for d in self.col.find()]

    def create_user(self, name: str, email: str, password: str, role: _UserRole) -> dict:
        email = email.lower()
        if self.col.find_one({"email": email}):
            raise ValueError(f"An account with this email already exists.")
        pw = _hash_password(password)
        self.col.insert_one({
            "_id": email,
            "email": email,
            "name": name,
            "role": role,
            "hash": pw["hash"],
            "salt": pw["salt"],
            "created_at": datetime.utcnow().isoformat(),
        })
        return {"email": email, "name": name, "role": role}

    def update_role(self, email: str, role: _UserRole) -> bool:
        email = email.lower()
        if email == ADMIN_EMAIL:
            raise ValueError("Cannot change the role of the default admin.")
        result = self.col.update_one({"email": email}, {"$set": {"role": role}})
        return result.matched_count == 1

    def delete_user(self, email: str) -> bool:
        email = email.lower()
        if email == ADMIN_EMAIL:
            raise ValueError("Cannot delete the default admin.")
        result = self.col.delete_one({"email": email})
        return result.deleted_count == 1


_store: MongoUserStore | None = None


def get_store() -> MongoUserStore:
    global _store
    if _store is None:
        _store = MongoUserStore()
    return _store


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str
    role: _UserRole


class UpdateRoleRequest(BaseModel):
    role: _UserRole


@router.post("/login")
def login(body: LoginRequest):
    user = get_store().authenticate(body.email.strip(), body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return user


@router.post("/register")
def register(body: RegisterRequest):
    try:
        return get_store().create_user(body.name.strip(), body.email.strip(), body.password, "l1")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("")
def list_users():
    return get_store().list_users()


@router.post("")
def create_user(body: CreateUserRequest):
    try:
        return get_store().create_user(body.name.strip(), body.email.strip(), body.password, body.role)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.patch("/{email}/role")
def update_role(email: str, body: UpdateRoleRequest):
    try:
        ok = get_store().update_role(email, body.role)
        if not ok:
            raise HTTPException(status_code=404, detail="User not found.")
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{email}")
def delete_user(email: str):
    try:
        ok = get_store().delete_user(email)
        if not ok:
            raise HTTPException(status_code=404, detail="User not found.")
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
