import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# In Docker: DATABASE_URL env var points to /data/bilancio.db (persistent volume)
# In dev: falls back to local ./bilancio.db
SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./bilancio.db")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
