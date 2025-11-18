from __future__ import annotations

import traceback
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config as C
from . import reconstruction as R
from .utils import make_job_id, save_upload_files, zip_dir

app = FastAPI(title="3DGS Online Reconstructor", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if C.ALLOWED_ORIGINS == ["*"] else C.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static mounts for outputs and logs
app.mount("/outputs", StaticFiles(directory=str(C.OUTPUT_DIR)), name="outputs")
app.mount("/logs", StaticFiles(directory=str(C.LOG_DIR)), name="logs")


@app.get("/health")
def health():
    return {"status": "ok", "gs_dir": str(C.GAUSSIAN_SPLATTING_DIR)}


@app.post("/reconstruct")
async def reconstruct(files: List[UploadFile] = File(...), scene_name: Optional[str] = None):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    job_id = make_job_id("recon")
    scene = scene_name or job_id

    # Layout
    job_root = C.UPLOAD_DIR / job_id
    img_dir = job_root / "images"
    work_dir = job_root / "work"
    out_dir = C.OUTPUT_DIR / job_id
    log_file = C.LOG_DIR / f"{job_id}.log"

    saved = await save_upload_files(files, img_dir)
    if len(saved) == 0:
        raise HTTPException(status_code=400, detail="No images saved")

    # Run pipeline (synchronously for simplicity)
    try:
        result = R.reconstruct(
            images_dir=img_dir,
            work_dir=work_dir,
            out_dir=out_dir,
            log_file=log_file,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Reconstruction error: {e}")

    # Zip output for download
    zip_path = (out_dir.parent / f"{job_id}.zip")
    zip_path = zip_dir(out_dir, zip_path)

    # Public URLs (served by StaticFiles)
    out_url = f"/outputs/{job_id}"
    zip_url = f"/outputs/{zip_path.name}"
    log_url = f"/logs/{log_file.name}"

    return {
        "job_id": job_id,
        "scene": scene,
        "saved_images": [str(p.name) for p in saved],
        "exit_code": result.get("exit_code", -1),
        "output_dir": out_url,
        "zip_url": zip_url,
        "log_url": log_url,
        "command": result.get("command"),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=C.HOST, port=C.PORT)