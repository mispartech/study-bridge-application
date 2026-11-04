"""Postgres connection to Supabase over verified TLS (same CA as scripts/db.mjs)."""

import os
from urllib.parse import quote, unquote

import psycopg

from .env import REPO_ROOT, load_env

CA_CERT = REPO_ROOT / "supabase" / "prod-ca-2021.crt"


def libpq_url(url: str) -> str:
    """Percent-encodes the user and password. Node's pg splits at the last '@', libpq at the first,
    so a raw '@' or ':' in the password works in scripts/db.mjs but not here without this."""
    scheme, rest = url.split("://", 1)
    if "@" not in rest:
        return url
    creds, host = rest.rsplit("@", 1)
    user, _, password = creds.partition(":")
    encoded = quote(unquote(user), safe="") + (f":{quote(unquote(password), safe='')}" if password else "")
    return f"{scheme}://{encoded}@{host}"


def connect(autocommit: bool = True) -> psycopg.Connection:
    load_env()
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError("SUPABASE_DB_URL is not set (see .env.example)")
    return psycopg.connect(libpq_url(url), sslmode="verify-full", sslrootcert=str(CA_CERT), autocommit=autocommit)
