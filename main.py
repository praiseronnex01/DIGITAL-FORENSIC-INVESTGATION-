from fastapi import Query

@app.get("/api/evidence/{evidence_pk}/file")
def get_evidence_file(
    evidence_pk: int,
    token: str | None = Query(None),
    db: Session = Depends(get_db),
    authorization: str | None = None,   # header
):
    # Resolve user from either Authorization header OR ?token=
    from jose import jwt, JWTError
    from auth import SECRET_KEY, ALGORITHM

    raw = None
    if token:
        raw = token
    elif authorization and authorization.startswith("Bearer "):
        raw = authorization[7:]
    if not raw:
        raise HTTPException(401, "Authentication required")
    try:
        payload = jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Invalid token")

    user = db.query(models.User).filter(models.User.id == uid).first()
    if not user:
        raise HTTPException(401, "Invalid token")

    ev = db.query(models.Evidence).filter(models.Evidence.id == evidence_pk).first()
    if not ev:
        raise HTTPException(404, "Evidence not found")
    _require_case(db, ev.case_id, user)
    if not ev.stored_path:
        raise HTTPException(404, "No file attached")
    full = os.path.join(UPLOAD_DIR, ev.stored_path)
    if not os.path.exists(full):
        raise HTTPException(404, "Stored file missing")
    inline = "inline" if (ev.mime_type or "").startswith("image/") else "attachment"
    return FileResponse(
        full, media_type=ev.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'{inline}; filename="{quote(os.path.basename(ev.filename))}"'},
    )