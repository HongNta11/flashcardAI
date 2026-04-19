import os
from typing import Optional
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_security = HTTPBearer(auto_error=False)


def verify_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_security),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=403, detail="Missing token")
    expected = os.environ.get("AUTH_TOKEN", "")
    if not expected or credentials.credentials != expected:
        raise HTTPException(status_code=403, detail="Invalid token")
    return credentials.credentials
