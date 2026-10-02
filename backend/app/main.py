"""GymBud API entry point. Feature endpoints will be added in later sprints."""

from fastapi import FastAPI

app = FastAPI(title="GymBud API", version="0.1.0")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Confirm the API process is responding."""
    return {"status": "ok"}
