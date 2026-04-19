import os
from typing import Optional
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_security = HTTPBearer(auto_error=False)


def verify_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_security),
) -> str:
    expected = os.environ.get("AUTH_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=500, detail="Server auth not configured")
    if credentials is None or credentials.credentials != expected:
        raise HTTPException(status_code=403, detail="Invalid token")
    return credentials.credentials
