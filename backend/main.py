from __future__ import annotations

import traceback
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi import APIRouter
import threading
import json
import time
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pathlib import Path as _Path

from . import config as C
from . import reconstruction as R
from .utils import make_job_id, save_upload_files, zip_dir, extract_zip

app = FastAPI(title="3DGS Online Reconstructor", version="0.1.2")

# 简单的内存任务状态映射（非持久化）
JOBS: dict[str, dict] = {}

# CORS
if C.ALLOWED_ORIGINS == ["*"]:
    # 当允许任意来源且需要携带凭据时，使用 allow_origin_regex 来回显 Origin
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=C.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Static mounts for outputs and logs
app.mount("/outputs", StaticFiles(directory=str(C.OUTPUT_DIR)), name="outputs")
app.mount("/logs", StaticFiles(directory=str(C.LOG_DIR)), name="logs")
app.mount("/uploads", StaticFiles(directory=str(C.UPLOAD_DIR)), name="uploads")
# Serve gs_editor (built assets) so前端可直接访问

_gs_dist = _Path(C.BASE_DIR) / "gs_editor" / "dist"
if _gs_dist.exists():
    app.mount("/gs_editor/dist", StaticFiles(directory=str(_gs_dist)), name="gs_editor")


@app.get("/health")
def health():
    """Simple health and environment check."""
    return {
        "status": "ok",
        "gs_dir": str(C.GAUSSIAN_SPLATTING_DIR),
        "outputs_dir": str(C.OUTPUT_DIR),
        "uploads_dir": str(C.UPLOAD_DIR),
        "logs_dir": str(C.LOG_DIR),
        "gs_editor_url": C.GS_EDITOR_URL,
        "gs_editor_dist_path": str(_gs_dist),
        "gs_editor_mounted": bool(_gs_dist.exists()),
        "gs_editor_index_exists": bool((_gs_dist / "index.html").exists()) if _gs_dist.exists() else False,
    }


@app.get("/status/{job_id}")
def status(job_id: str):
    out_dir = C.OUTPUT_DIR / job_id
    status_file = out_dir / "status.json"
    if not status_file.exists():
        return {"stage": "unknown"}
    try:
        import json
        return json.loads(status_file.read_text(encoding="utf-8"))
    except Exception:
        return {"stage": "corrupt"}


@app.post("/reconstruct")
async def reconstruct(
    files: List[UploadFile] = File(...),
    scene_name: Optional[str] = Form(None),
    upload_type: str = Form("files"),  # files | folder | zip
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # 若用户提供 scene_name，则直接用其作为 job_id，保持目录与文件名一致
    if scene_name:
        # 清理非法字符，限制为字母数字下划线和中划线
        import re
        cleaned = re.sub(r"[^A-Za-z0-9_-]", "_", scene_name.strip()) or "scene"
        job_id = cleaned
    else:
        job_id = make_job_id("recon")
    scene = job_id

    # Layout
    job_root = C.UPLOAD_DIR / job_id
    # 根据新要求：前端上传的图片直接放在 input 目录
    img_dir = job_root / "input"
    work_dir = job_root / "work"
    out_dir = C.OUTPUT_DIR / job_id
    log_file = C.LOG_DIR / f"{job_id}.log"

    saved: List[Path] = []
    if upload_type == "zip":
        if len(files) != 1:
            raise HTTPException(status_code=400, detail="Zip 模式仅允许上传一个压缩包")
        tmp_zip = job_root / files[0].filename
        tmp_saved = await save_upload_files(files, job_root)
        if not tmp_saved:
            raise HTTPException(status_code=400, detail="未收到 zip 文件")
        # 解压图片到 images_dir
        saved = extract_zip(tmp_saved[0], img_dir)
        if not saved:
            raise HTTPException(status_code=400, detail="zip 中未找到可用图片")
    else:
        # files 或 folder 模式均视为多文件图片上传
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

    # 保留同步接口，但移除 output_dir 字段
    return {
        "job_id": job_id,
        "scene": scene,
        "upload_type": upload_type,
        "saved_images": [str(p.name) for p in saved],
        "exit_code": result.get("exit_code", -1),
        "zip_url": zip_url,
        "log_url": log_url,
        "command": result.get("command"),
    }


def _find_point_cloud(out_dir: Path) -> str | None:
    # 固定目标路径: point_cloud/iteration_30000/point_cloud.ply
    target = out_dir / "point_cloud" / "iteration_30000" / "point_cloud.ply"
    if target.exists():
        return f"/outputs/{out_dir.name}/" + str(target.relative_to(out_dir)).replace("\\", "/")
    return None


def _find_cameras(out_dir: Path) -> str | None:
    # 固定目标路径: cameras.json 位于输出根目录
    target = out_dir / "cameras.json"
    if target.exists():
        return f"/outputs/{out_dir.name}/" + str(target.relative_to(out_dir)).replace("\\", "/")
    return None


@app.get("/viewer/{job_id}")
def viewer(job_id: str):
    """Return a ready-to-use gs_editor URL with query parameters for ply/cameras/images.
    前端可以直接跳转该链接以在浏览器中加载对应数据。
    """
    out_dir = C.OUTPUT_DIR / job_id
    upload_root = C.UPLOAD_DIR / job_id
    if not out_dir.exists():
        raise HTTPException(status_code=404, detail="job not found")
    ply = _find_point_cloud(out_dir)
    cams = _find_cameras(out_dir)
    images_dir = upload_root / "input"
    # 将图片目录暴露为 /uploads/<job_id>/input/ 相对路径
    images_url = f"/uploads/{job_id}/input" if images_dir.exists() else None
    base_editor = C.GS_EDITOR_URL
    # 拼接查询参数（浏览器侧脚本解析）
    import urllib.parse as _up
    q = {
        "ply": f"{ply}" if ply else "",
        "cameras": f"{cams}" if cams else "",
        "images": images_url or "",
    }
    query = _up.urlencode(q)
    full_url = f"{base_editor}?{query}"

    diagnostics = {
        "outputs_dir": str(C.OUTPUT_DIR),
        "uploads_dir": str(C.UPLOAD_DIR),
        "job_out_dir": str(out_dir),
        "job_upload_dir": str(upload_root),
        "gs_editor_url": C.GS_EDITOR_URL,
        "gs_editor_dist_path": str(_gs_dist),
        "gs_editor_mounted": bool(_gs_dist.exists()),
        "gs_editor_index_exists": bool((_gs_dist / "index.html").exists()) if _gs_dist.exists() else False,
        "ply_exists": bool(ply),
        "cameras_exists": bool(cams),
        "images_dir_exists": images_dir.exists(),
        "images_url": images_url,
        "issues": [],
        "warnings": [],
    }
    if not ply:
        diagnostics["issues"].append("point_cloud.ply 未找到: 期望 outputs/<job_id>/point_cloud/iteration_30000/point_cloud.ply")
    if not cams:
        diagnostics["issues"].append("cameras.json 未找到: 期望 outputs/<job_id>/cameras.json")
    if not images_dir.exists():
        diagnostics["warnings"].append("原始图片目录缺失: uploads/<job_id>/input")
    if not diagnostics["gs_editor_mounted"]:
        diagnostics["issues"].append("gs_editor/dist 未挂载，无法打开内置查看器")
    elif not diagnostics["gs_editor_index_exists"]:
        diagnostics["issues"].append("gs_editor/dist/index.html 不存在")

    return {
        "job_id": job_id,
        "ply_url": ply,
        "cameras_url": cams,
        "images_url": images_url,
        "editor_url": full_url,
        "diagnostics": diagnostics,
    }


def _async_reconstruct(job_id: str, scene: str, upload_type: str, img_dir: Path, work_dir: Path, out_dir: Path, log_file: Path):
    JOBS[job_id] = {"stage": "running", "done": False, "log_url": f"/logs/{log_file.name}"}
    try:
        result = R.reconstruct(images_dir=img_dir, work_dir=work_dir, out_dir=out_dir, log_file=log_file)
        # After training, zip outputs
        zip_path = (out_dir.parent / f"{job_id}.zip")
        zip_path = zip_dir(out_dir, zip_path)
        point_cloud_url = _find_point_cloud(out_dir)
        cameras_url = _find_cameras(out_dir)
        JOBS[job_id].update({
            "done": True,
            "exit_code": result.get("exit_code", -1),
            "zip_url": f"/outputs/{zip_path.name}",
            "point_cloud_url": point_cloud_url,
            "cameras_url": cameras_url,
            "command": result.get("command"),
        })
    except Exception as e:
        JOBS[job_id].update({"done": True, "error": str(e), "exit_code": -1})


@app.post("/reconstruct_stream")
async def reconstruct_stream(
    files: List[UploadFile] = File(...),
    scene_name: Optional[str] = Form(None),
    upload_type: str = Form("files"),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    if scene_name:
        import re
        cleaned = re.sub(r"[^A-Za-z0-9_-]", "_", scene_name.strip()) or "scene"
        job_id = cleaned
    else:
        job_id = make_job_id("recon")
    scene = job_id
    job_root = C.UPLOAD_DIR / job_id
    img_dir = job_root / "input"  # 新布局
    work_dir = job_root / "work"
    out_dir = C.OUTPUT_DIR / job_id
    log_file = C.LOG_DIR / f"{job_id}.log"

    saved: List[Path] = []
    if upload_type == "zip":
        if len(files) != 1:
            raise HTTPException(status_code=400, detail="Zip 模式仅允许上传一个压缩包")
        tmp_saved = await save_upload_files(files, job_root)
        from .utils import extract_zip
        saved = extract_zip(tmp_saved[0], img_dir)
        if not saved:
            raise HTTPException(status_code=400, detail="zip 中未找到可用图片")
    else:
        saved = await save_upload_files(files, img_dir)
        if not saved:
            raise HTTPException(status_code=400, detail="No images saved")

    # 启动后台线程执行重建
    th = threading.Thread(target=_async_reconstruct, args=(job_id, scene, upload_type, img_dir, work_dir, out_dir, log_file), daemon=True)
    th.start()

    return {
        "job_id": job_id,
        "scene": scene,
        "upload_type": upload_type,
        "log_url": f"/logs/{log_file.name}",
        "status_url": f"/result/{job_id}",
    }


@app.get("/result/{job_id}")
def result(job_id: str):
    data = JOBS.get(job_id)
    if not data:
        return {"error": "job not found"}
    return data


if __name__ == "__main__":
    import uvicorn
    import socket

    def _find_free_port(preferred: int) -> int:
        # 尝试首选端口
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((C.HOST, preferred))
                return preferred
            except OSError:
                pass
        # 使用系统分配的空闲端口
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((C.HOST, 0))
            return s.getsockname()[1]

    port = _find_free_port(C.PORT)
    print(f"[backend] Serving on http://{C.HOST}:{port}")
    uvicorn.run(app, host=C.HOST, port=port)