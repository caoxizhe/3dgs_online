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
# 默认使用项目内的 gaussian-splatting 目录；可用环境变量 GAUSSIAN_SPLATTING_DIR 覆盖
GAUSSIAN_SPLATTING_DIR: Path = Path(
    os.getenv("GAUSSIAN_SPLATTING_DIR", str(BASE_DIR / "gaussian-splatting"))
).resolve()
COLMAP_BIN: str = os.getenv("COLMAP_BIN", "colmap")  # in PATH or absolute
PYTHON_EXE: str = os.getenv("PYTHON_EXE", sys.executable)
GS_EDITOR_URL: str = os.getenv("GS_EDITOR_URL", "/gs_editor/dist/index.html")

# Optional: one-shot script to run COLMAP+3DGS. Placeholders:
#   {images} {work} {out} {gs} {py} {colmap}
# Example:
#   GS_RECON_CMD='bash run_colmap.sh --images {images} --out {work}/colmap && \
#     {py} {gs}/scripts/colmap2nerf.py -i {images} -s {work}/colmap/sparse/0 -o {work}/gs_data && \
#     {py} {gs}/train.py -s {work}/gs_data -m {out}'
RECON_CMD_TEMPLATE: str | None = os.getenv("GS_RECON_CMD", None)

# Viewer 产物路径（相对于 out_dir），可通过环境变量覆盖以适配不同引擎输出结构
PLY_REL_PATH: str = os.getenv("PLY_REL_PATH", "point_cloud/iteration_30000/point_cloud.ply")
CAMERAS_REL_PATH: str = os.getenv("CAMERAS_REL_PATH", "cameras.json")

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