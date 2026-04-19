import os
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_security = HTTPBearer()


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(_security),
) -> str:
    expected = os.environ.get("AUTH_TOKEN", "")
    if not expected or credentials.credentials != expected:
        raise HTTPException(status_code=403, detail="Invalid token")
    return credentials.credentials
