"""
Migrazione dati: SQLite locale → PostgreSQL cloud (Neon.tech)

Uso:
    python migrate_to_cloud.py "postgresql://user:pass@host/dbname?sslmode=require"

Legge il database SQLite locale e copia tutti i dati nel PostgreSQL cloud.
"""
import sys
import os

# Aggiungi backend al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "backend", "bilancio.db")

TABLES_ORDER = [
    "categories",
    "transactions",
    "investments",
    "category_rules",
    "category_corrections",
    "recurring_transactions",
    "budget_limits",
    "dismissed_suggestions",
]


def migrate(pg_url: str):
    if pg_url.startswith("postgres://"):
        pg_url = pg_url.replace("postgres://", "postgresql://", 1)

    print(f"[1/4] Connessione a SQLite: {SQLITE_PATH}")
    sqlite_engine = create_engine(f"sqlite:///{SQLITE_PATH}")
    sqlite_session = sessionmaker(bind=sqlite_engine)()

    print(f"[2/4] Connessione a PostgreSQL...")
    pg_engine = create_engine(pg_url)
    pg_session = sessionmaker(bind=pg_engine)()

    # Crea le tabelle nel PostgreSQL
    print("[3/4] Creazione tabelle...")
    from models import Base
    Base.metadata.create_all(bind=pg_engine)

    # Verifica quali tabelle esistono in SQLite
    sqlite_inspector = inspect(sqlite_engine)
    existing_tables = sqlite_inspector.get_table_names()

    print("[4/4] Migrazione dati...")
    total = 0
    for table_name in TABLES_ORDER:
        if table_name not in existing_tables:
            print(f"  ⏭  {table_name} — non esiste in SQLite, salto")
            continue

        # Leggi dati da SQLite
        rows = sqlite_session.execute(text(f"SELECT * FROM {table_name}")).fetchall()
        if not rows:
            print(f"  ⏭  {table_name} — vuota")
            continue

        # Prendi nomi colonne
        columns = [col["name"] for col in sqlite_inspector.get_columns(table_name)]

        # Pulisci tabella PostgreSQL prima di inserire
        pg_session.execute(text(f"DELETE FROM {table_name}"))

        # Inserisci righe
        for row in rows:
            row_dict = dict(zip(columns, row))
            cols = ", ".join(row_dict.keys())
            placeholders = ", ".join(f":{k}" for k in row_dict.keys())
            pg_session.execute(
                text(f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders})"),
                row_dict
            )

        total += len(rows)
        print(f"  ✅ {table_name} — {len(rows)} righe migrate")

    # Reset sequenze auto-increment per PostgreSQL
    for table_name in TABLES_ORDER:
        if table_name not in existing_tables:
            continue
        try:
            pg_session.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table_name}), 0) + 1, false)"
            ))
        except Exception:
            pass

    pg_session.commit()
    pg_session.close()
    sqlite_session.close()

    print(f"\n🎉 Migrazione completata! {total} righe totali migrate.")
    print("L'app cloud userà questi dati.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python migrate_to_cloud.py \"postgresql://user:pass@host/dbname?sslmode=require\"")
        print("\nPrendi l'URL dal dashboard di Neon.tech")
        sys.exit(1)

    migrate(sys.argv[1])
