import os
from pathlib import Path
from fastapi import APIRouter, Depends
from .auth import verify_token

router = APIRouter()


def get_books_dir() -> Path:
    return Path(os.environ.get("BOOKS_DIR", "./books"))


@router.get("/books")
def list_books(token: str = Depends(verify_token)):
    return {"books": []}
