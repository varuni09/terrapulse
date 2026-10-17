# TERRAPULSE
Urban heat and land-cover intelligence for Chennai.

## Quick start
    cp .env.example .env
    docker compose up -d db api
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    pytest
    # frontend
    npx create-next-app@latest apps/web --ts --tailwind --app --eslint

API: http://localhost:8000/docs
