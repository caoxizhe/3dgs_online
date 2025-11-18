from __future__ import annotations

import os
import sys
from pathlib import Path

# Project base: .../3dgs_online
BASE_DIR: Path = Path(__file__).resolve().parents[1]
DATA_DIR: Path = BASE_DIR / "data"
UPLOAD_DIR: Path = DATA_DIR / "uploads"
OUTPUT_DIR: Path = DATA_DIR / "outputs"
LOG_DIR: Path = DATA_DIR / "logs"

# External tools/paths (override via env vars if needed)
GAUSSIAN_SPLATTING_DIR: Path = Path(
    os.getenv("GAUSSIAN_SPLATTING_DIR", BASE_DIR.parent / "gaussian-splatting")
).resolve()
COLMAP_BIN: str = os.getenv("COLMAP_BIN", "colmap")  # in PATH or absolute
PYTHON_EXE: str = os.getenv("PYTHON_EXE", sys.executable)

# Optional: one-shot script to run COLMAP+3DGS. Placeholders:
#   {images} {work} {out} {gs} {py} {colmap}
# Example:
#   GS_RECON_CMD='bash run_colmap.sh --images {images} --out {work}/colmap && \
#     {py} {gs}/scripts/colmap2nerf.py -i {images} -s {work}/colmap/sparse/0 -o {work}/gs_data && \
#     {py} {gs}/train.py -s {work}/gs_data -m {out}'
RECON_CMD_TEMPLATE: str | None = os.getenv("GS_RECON_CMD", None)

# Server
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", 8000))

# CORS
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]

# Ensure directories
for d in (UPLOAD_DIR, OUTPUT_DIR, LOG_DIR):
    d.mkdir(parents=True, exist_ok=True)


def resolve_path(p: Path | str) -> Path:
    return Path(p).expanduser().resolve()