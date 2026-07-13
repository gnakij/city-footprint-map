import asyncio
import importlib
import sys
import uuid
from typing import Any
from types import SimpleNamespace

import fastapi.routing
import fastapi.dependencies.utils
import httpx
import starlette.routing


_uuid_counter = 0


def deterministic_uuid4() -> uuid.UUID:
    global _uuid_counter
    _uuid_counter += 1
    return uuid.UUID(int=_uuid_counter)


class FakePwdContext:
    def hash(self, password: str) -> str:
        return f"test-hash:{password}"

    def verify(self, password: str, password_hash: str) -> bool:
        return password_hash == self.hash(password)


async def run_sync_inline(func, *args, **kwargs):
    return func(*args, **kwargs)


class ASGITestClient:
    def __init__(self, app):
        self.app = app

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        transport = httpx.ASGITransport(app=self.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.request(method, path, **kwargs)

    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        return asyncio.run(self._request(method, path, **kwargs))

    def get(self, path: str, **kwargs: Any) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> httpx.Response:
        return self.request("POST", path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> httpx.Response:
        return self.request("PUT", path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> httpx.Response:
        return self.request("DELETE", path, **kwargs)


def make_client(tmp_path, monkeypatch):
    monkeypatch.setenv("CITYPRINT_DB_PATH", str(tmp_path / "cityprint-test.db"))
    monkeypatch.setenv("CITYPRINT_SECRET_KEY", "test-secret")
    monkeypatch.delenv("CITYPRINT_ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("CITYPRINT_ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("CITYPRINT_ADMIN_NAME", raising=False)
    monkeypatch.setattr(uuid, "uuid4", deterministic_uuid4)
    # The Codex sandbox used for these tests has no usable /dev/urandom.
    # Importing stdlib crypt can fail while passlib initializes optional
    # unix-crypt handlers. The app uses bcrypt, so a minimal crypt shim keeps
    # tests focused on API behavior without changing production code.
    sys.modules.setdefault("crypt", SimpleNamespace(crypt=lambda secret, salt: None))
    import passlib.context as passlib_context

    monkeypatch.setattr(fastapi.dependencies.utils, "run_in_threadpool", run_sync_inline)
    monkeypatch.setattr(fastapi.routing, "run_in_threadpool", run_sync_inline)
    monkeypatch.setattr(starlette.routing, "run_in_threadpool", run_sync_inline)
    monkeypatch.setattr(passlib_context, "CryptContext", lambda *args, **kwargs: FakePwdContext())
    import backend.app as app_module

    importlib.reload(app_module)
    return ASGITestClient(app_module.app)


def bootstrap_admin(client: ASGITestClient, username="admin", password="admin123456"):
    response = client.post(
        "/api/bootstrap/admin",
        json={"username": username, "password": password, "name": "管理员", "is_admin": False},
    )
    assert response.status_code == 201, response.text
    assert response.json()["is_admin"] is True
    return response.json()


def auth_headers(client: ASGITestClient, username="admin", password="admin123456"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_empty_db_requires_bootstrap_and_auth_flow(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    status = client.get("/api/bootstrap/status")
    assert status.status_code == 200
    assert status.json()["requires_admin_setup"] is True

    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123456"})
    assert response.status_code == 401

    created = bootstrap_admin(client)
    assert created["username"] == "admin"

    status = client.get("/api/bootstrap/status")
    assert status.status_code == 200
    assert status.json()["requires_admin_setup"] is False

    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123456"})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["username"] == "admin"
    assert body["user"]["is_admin"] is True
    assert "password_hash" not in body["user"]

    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["name"] == "管理员"

    duplicate_bootstrap = client.post(
        "/api/bootstrap/admin",
        json={"username": "other-admin", "password": "secret123", "name": "Other"},
    )
    assert duplicate_bootstrap.status_code == 409


def test_register_login_update_current_user(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    created = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret123", "name": "Alice", "is_admin": False},
    )
    assert created.status_code == 201
    assert created.json()["username"] == "alice"

    headers = auth_headers(client, "alice", "secret123")
    updated = client.put("/api/users/me", json={"name": "Alice Zhang"}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["name"] == "Alice Zhang"

    duplicate = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret123", "name": "Other", "is_admin": False},
    )
    assert duplicate.status_code == 409


def test_public_register_cannot_create_admin(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    created = client.post(
        "/api/auth/register",
        json={"username": "mallory", "password": "secret123", "name": "Mallory", "is_admin": True},
    )

    assert created.status_code == 201
    assert created.json()["username"] == "mallory"
    assert created.json()["is_admin"] is False


def test_bootstrap_admin_remains_available_after_public_register(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    user = client.post(
        "/api/auth/register",
        json={"username": "first-user", "password": "secret123", "name": "First User"},
    )
    assert user.status_code == 201
    assert user.json()["is_admin"] is False

    status = client.get("/api/bootstrap/status")
    assert status.status_code == 200
    assert status.json()["requires_admin_setup"] is True

    admin = bootstrap_admin(client, username="owner", password="owner123456")
    assert admin["is_admin"] is True

    status = client.get("/api/bootstrap/status")
    assert status.status_code == 200
    assert status.json()["requires_admin_setup"] is False


def test_admin_user_management_requires_admin(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    bootstrap_admin(client)
    user = client.post(
        "/api/auth/register",
        json={"username": "bob", "password": "secret123", "name": "Bob", "is_admin": False},
    ).json()
    user_headers = auth_headers(client, "bob", "secret123")

    assert client.get("/api/users", headers=user_headers).status_code == 403

    admin_headers = auth_headers(client)
    admin_created = client.post(
        "/api/users",
        json={"username": "carol", "password": "secret123", "name": "Carol", "is_admin": True},
        headers=admin_headers,
    )
    assert admin_created.status_code == 201
    assert admin_created.json()["is_admin"] is True

    users = client.get("/api/users", headers=admin_headers)
    assert users.status_code == 200
    assert {item["username"] for item in users.json()} >= {"admin", "bob"}

    changed = client.put(
        f"/api/users/{user['id']}",
        json={"name": "Bobby", "password": "newpass123"},
        headers=admin_headers,
    )
    assert changed.status_code == 200
    assert changed.json()["name"] == "Bobby"

    assert client.post("/api/auth/login", json={"username": "bob", "password": "newpass123"}).status_code == 200
    assert client.delete(f"/api/users/{user['id']}", headers=admin_headers).status_code == 204


def test_visits_are_scoped_to_current_user(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    client.post("/api/auth/register", json={"username": "u1", "password": "secret123", "name": "U1"})
    client.post("/api/auth/register", json={"username": "u2", "password": "secret123", "name": "U2"})
    u1_headers = auth_headers(client, "u1", "secret123")
    u2_headers = auth_headers(client, "u2", "secret123")

    created = client.post(
        "/api/visits",
        json={"city_id": "beijing", "duration_days": 3, "last_stay_date": "2026-01-03", "notes": "work"},
        headers=u1_headers,
    )
    assert created.status_code == 201
    visit_id = created.json()["id"]

    assert len(client.get("/api/visits", headers=u1_headers).json()) == 1
    assert client.get("/api/visits", headers=u2_headers).json() == []

    updated = client.put(
        f"/api/visits/{visit_id}",
        json={"notes": "updated", "duration_days": 2, "last_stay_date": "2026-01-03"},
        headers=u1_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "updated"

    date_only_update = client.put(
        f"/api/visits/{visit_id}",
        json={"last_stay_date": "2026-01-04"},
        headers=u1_headers,
    )
    assert date_only_update.status_code == 200
    assert date_only_update.json()["notes"] == "updated"

    assert client.delete(f"/api/visits/{visit_id}", headers=u2_headers).status_code == 404
    assert client.delete(f"/api/visits/{visit_id}", headers=u1_headers).status_code == 204


def test_core_input_validation_rejects_bad_city_date_theme_and_import(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    bootstrap_admin(client)
    headers = auth_headers(client)

    bad_city = client.post(
        "/api/visits",
        json={"city_id": "not-a-city", "duration_days": 1, "last_stay_date": "2026-01-03"},
        headers=headers,
    )
    assert bad_city.status_code == 422

    bad_date = client.post(
        "/api/visits",
        json={"city_id": "beijing", "duration_days": 1, "last_stay_date": "2026-02-31"},
        headers=headers,
    )
    assert bad_date.status_code == 422

    bad_theme = client.put("/api/settings", json={"theme": "midnight"}, headers=headers)
    assert bad_theme.status_code == 422

    bad_import = client.post(
        "/api/data/import",
        json={
            "version": "3.0.0",
            "exported_at": "2026-01-01T00:00:00Z",
            "visits": [{"city_id": "beijing", "duration_days": 1, "last_stay_date": "2026-99-01"}],
            "achievements": [],
            "settings": {"theme": "rose"},
        },
        headers=headers,
    )
    assert bad_import.status_code == 422

    legacy_import = client.post(
        "/api/data/import",
        json={
            "version": "2.0.0",
            "exported_at": "2026-01-01T00:00:00Z",
            "visits": [{"city_id": "shanghai", "arrival_date": "2026-02-01", "departure_date": "2026-02-03"}],
            "achievements": [],
            "settings": {"theme": "azure"},
        },
        headers=headers,
    )
    assert legacy_import.status_code == 200
    imported_visit = next(visit for visit in legacy_import.json()["visits"] if visit["city_id"] == "shanghai")
    assert imported_visit["duration_days"] == 3
    assert imported_visit["last_stay_date"] == "2026-02-03"
    assert legacy_import.json()["settings"]["theme"] == "azure"


def test_data_export_import_clear_and_cities(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    bootstrap_admin(client)
    headers = auth_headers(client)

    cities = client.get("/api/cities")
    assert cities.status_code == 200
    assert any(city["city_id"] == "beijing" for city in cities.json())

    client.post(
        "/api/visits",
        json={"city_id": "shanghai", "duration_days": 2, "last_stay_date": "2026-02-02"},
        headers=headers,
    )
    exported = client.post("/api/data/export", headers=headers)
    assert exported.status_code == 200
    data = exported.json()
    assert len(data["visits"]) == 1

    assert client.post("/api/data/clear", headers=headers).status_code == 204
    assert client.get("/api/visits", headers=headers).json() == []

    imported = client.post("/api/data/import", json=data, headers=headers)
    assert imported.status_code == 200
    assert len(client.get("/api/visits", headers=headers).json()) == 1
