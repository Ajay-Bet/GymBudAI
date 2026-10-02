# GymBud backend

Minimal Python/FastAPI scaffold. Requires Python 3.10 or newer.

## Run locally

From `backend/`, using a Python 3.10+ interpreter:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8080
```

If `python3 --version` is older than 3.10, use an available newer interpreter (for example, `python3.12`) in the first command.

- Health check: <http://localhost:8080/health>
- Interactive API documentation: <http://localhost:8080/docs>

`app/main.py` creates the application and exposes a process health check. The `api`, `models`, `schemas`, `services`, `database`, and `core` packages are empty placeholders for future sprint work.

Authentication, databases, migrations, CORS, and deployment are not configured. The frontend still calls the removed `/users/login` and `/users/profile` endpoints; these features will not work until the planned authentication/persistence sprint implements and connects the replacement APIs.
