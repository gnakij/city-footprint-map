import importlib

from fastapi.testclient import TestClient


def make_client(tmp_path, monkeypatch):
    monkeypatch.setenv("CITYPRINT_DB_PATH", str(tmp_path / "cityprint-test.db"))
    monkeypatch.setenv("CITYPRINT_SECRET_KEY", "test-secret")
    import backend.app as app_module

    importlib.reload(app_module)
    return TestClient(app_module.app)


def auth_headers(client: TestClient, username="admin", password="admin123"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_default_admin_and_auth_flow(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)

    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["username"] == "admin"
    assert body["user"]["is_admin"] is True
    assert "password_hash" not in body["user"]

    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["name"] == "管理员"


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


def test_admin_user_management_requires_admin(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    user = client.post(
        "/api/auth/register",
        json={"username": "bob", "password": "secret123", "name": "Bob", "is_admin": False},
    ).json()
    user_headers = auth_headers(client, "bob", "secret123")

    assert client.get("/api/users", headers=user_headers).status_code == 403

    admin_headers = auth_headers(client)
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
        json={"city_id": "beijing", "arrival_date": "2026-01-01", "departure_date": "2026-01-03", "notes": "work"},
        headers=u1_headers,
    )
    assert created.status_code == 201
    visit_id = created.json()["id"]

    assert len(client.get("/api/visits", headers=u1_headers).json()) == 1
    assert client.get("/api/visits", headers=u2_headers).json() == []

    updated = client.put(
        f"/api/visits/{visit_id}",
        json={"notes": "updated", "arrival_date": "2026-01-02", "departure_date": "2026-01-03"},
        headers=u1_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "updated"

    assert client.delete(f"/api/visits/{visit_id}", headers=u2_headers).status_code == 404
    assert client.delete(f"/api/visits/{visit_id}", headers=u1_headers).status_code == 204


def test_data_export_import_clear_and_cities(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    headers = auth_headers(client)

    cities = client.get("/api/cities")
    assert cities.status_code == 200
    assert any(city["city_id"] == "beijing" for city in cities.json())

    client.post(
        "/api/visits",
        json={"city_id": "shanghai", "arrival_date": "2026-02-01", "departure_date": "2026-02-02"},
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
