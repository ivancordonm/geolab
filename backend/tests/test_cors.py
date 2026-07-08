from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cors_allows_the_default_frontend_origin() -> None:
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_rejects_an_unlisted_origin() -> None:
    response = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers
