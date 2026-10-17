from fastapi.testclient import TestClient
from services.api.main import app

c = TestClient(app)


def test_health():
    assert c.get("/health").json() == {"status": "ok"}


def test_cities():
    assert c.get("/api/v1/cities").json()[0]["code"] == "chennai"
