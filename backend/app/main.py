"""FastAPI composition root for the architecture milestone."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.router import router as agent_router
from app.geometry.router import router as geometry_router
from app.mcp_server import mcp, mcp_http_app


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Run the MCP transport manager alongside the FastAPI application."""

    async with mcp.session_manager.run():
        yield

app = FastAPI(
    title="GeoLab API",
    version="0.1.0",
    description="Deterministic mathematics services for the GeoLab workspace.",
    lifespan=lifespan,
)

# CORS configuration for frontend (Vercel + local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Mcp-Session-Id"],
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


# Keep this mount last so the existing REST and documentation routes take precedence.
# The mounted app serves the exact public endpoint `/mcp`.
app.mount("/", mcp_http_app)
