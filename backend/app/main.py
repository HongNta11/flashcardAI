from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db, get_db_path
from .books import router as books_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(get_db_path())
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Flashcard API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(books_router)
    return app


app = create_app()
