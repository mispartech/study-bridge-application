"""Postgres connection to Supabase over verified TLS (same CA as scripts/db.mjs)."""

import os

import psycopg

from .env import REPO_ROOT, load_env

CA_CERT = REPO_ROOT / "supabase" / "prod-ca-2021.crt"


def connect(autocommit: bool = True) -> psycopg.Connection:
    load_env()
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError("SUPABASE_DB_URL is not set (see .env.example)")
    return psycopg.connect(url, sslmode="verify-full", sslrootcert=str(CA_CERT), autocommit=autocommit)
