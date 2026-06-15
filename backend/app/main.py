"""FastAPI composition root for the architecture milestone."""

from fastapi import FastAPI

from app.agent.router import router as agent_router
from app.geometry.router import router as geometry_router

app = FastAPI(
    title="GeoLab API",
    version="0.1.0",
    description="Deterministic mathematics services for the GeoLab workspace.",
)

app.include_router(geometry_router)
app.include_router(agent_router)


@app.get("/")
def root() -> dict[str, str]:
    """Describe the current scaffold without implying feature completeness."""
    return {
        "name": "GeoLab API",
        "status": "mvp-in-development",
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict[str, str]:
    """Provide a minimal process health probe."""
    return {"status": "ok"}
