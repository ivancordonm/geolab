import pytest
from fastapi.testclient import TestClient

import app.agent.router as router
from app.agent.planner import ProviderTimeoutError, RuleBasedPlanner
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _use_rule_based_planner(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin a deterministic planner so these tests exercise the HTTP contract,
    independent of which provider MATHLLM_LLM_PROVIDER selects at runtime."""
    monkeypatch.setattr(router, "create_planner", lambda config=None: RuleBasedPlanner())


def test_agent_plan_endpoint_returns_camel_case_response() -> None:
    response = client.post(
        "/agent/plan",
        json={"userRequest": "Draw circle centered at A through C"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["generatedScript"].endswith("c1 = Circle(A, C)")
    assert payload["plan"] == ["Draw circle c1 centered at A through C."]
    assert "validated" in payload["reasoning"]


def test_agent_plan_endpoint_returns_unsupported_request_error() -> None:
    response = client.post(
        "/agent/plan",
        json={"userRequest": "Integrate sin(x)"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unsupported_request"


def test_agent_plan_endpoint_returns_provider_timeout_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class TimeoutPlanner:
        def generate_plan(self, user_request: str, current_script: str | None = None):
            raise ProviderTimeoutError("The provider did not respond within 300 seconds.")

    monkeypatch.setattr(router, "create_planner", lambda config=None: TimeoutPlanner())

    response = client.post("/agent/plan", json={"userRequest": "Draw a triangle"})

    assert response.status_code == 504
    assert response.json()["detail"] == {
        "code": "provider_timeout",
        "message": "The provider did not respond within 300 seconds.",
    }
