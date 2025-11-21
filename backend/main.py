from __future__ import annotations

import traceback
import shutil
from pathlib import Path
from typing import List, Optional
import threading
import json
import time
import urllib.parse
import socket

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from pathlib import Path as _Path

from . import config as C
from . import reconstruction as R
from .utils import make_job_id, save_upload_files, zip_dir, extract_zip

app = FastAPI(title="3DGS Online Reconstructor", version="0.1.2")

JOBS: dict[str, dict] = {}

# CORS
if C.ALLOWED_ORIGINS == ["*"]:
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

# 静态文件挂载
app.mount("/outputs", StaticFiles(directory=str(C.OUTPUT_DIR)), name="outputs")
app.mount("/logs", StaticFiles(directory=str(C.LOG_DIR)), name="logs")
app.mount("/uploads", StaticFiles(directory=str(C.UPLOAD_DIR)), name="uploads")

_gs_dist = _Path(C.BASE_DIR) / "gs_editor" / "dist"
if _gs_dist.exists():
    app.mount("/gs_editor/dist", StaticFiles(directory=str(_gs_dist)), name="gs_editor")


# --- 健康检查端点 ---

# 验证服务器是否正在运行并检查关键目录路径
@app.get("/health")
def health():
    return {
        "status": "ok",
        "gs_dir": str(C.GAUSSIAN_SPLATTING_DIR),
        "outputs_dir": str(C.OUTPUT_DIR),
        "uploads_dir": str(C.UPLOAD_DIR),
    }

# --- 1. 项目端点 ---
# 列出所有正在运行和已完成的项目
@app.get("/projects")
def list_projects():
    project_list = []
    seen_ids = set()
    
     # 首先，从内存中的 JOBS 字典中添加所有当前正在运行的作业
    for job_id, job_data in JOBS.items():
        project_list.append(job_data)
        seen_ids.add(job_id)

    # 扫描输出目录以查找不在内存中的已完成作业
    if C.OUTPUT_DIR.exists():
        for job_dir in C.OUTPUT_DIR.iterdir():
            if job_dir.is_dir() and job_dir.name not in seen_ids:
                job_id = job_dir.name
                # 检查最终的点云文件是否存在，如果有则表示成功
                ply_exists = (job_dir / "point_cloud" / "iteration_30000" / "point_cloud.ply").exists()
                
                status_file = job_dir / "status.json"
                status_data = {}
                if status_file.exists():
                    try: status_data = json.loads(status_file.read_text(encoding="utf-8"))
                    except: pass

                if ply_exists:
                    # 如果成功，创建一个“完成”的项目条目
                    zip_path = C.OUTPUT_DIR / f"{job_id}.zip"
                    zip_url = f"/outputs/{job_id}.zip" if zip_path.exists() else None
                    project_list.append({
                        "job_id": job_id,
                        "scene": status_data.get("scene", job_id),
                        "stage": "Done",
                        "done": True,
                        "zip_url": zip_url,
                        "thumbnail": "https://images.unsplash.com/photo-1621569898825-3e7916518775?w=500&auto=format&fit=crop"
                    })
                elif status_data.get("exit_code", 0) != 0:
                    # 如果状态指示失败，则创建一个“失败”的项目条目
                     project_list.append({
                        "job_id": job_id,
                        "scene": status_data.get("scene", job_id),
                        "stage": "Failed",
                        "done": True,
                        "error": "Training failed"
                    })

    # 返回按 job_id 降序排序的项目列表
    return sorted(project_list, key=lambda x: x["job_id"], reverse=True)


# --- 2. Viewer 的辅助函数 ---
#查找生成的点云文件的路径
def _find_point_cloud(out_dir: Path) -> str | None:
    target = out_dir / "point_cloud" / "iteration_30000" / "point_cloud.ply"
    if target.exists():
        # Returns relative path like "/outputs/truck/..."
        return f"/outputs/{out_dir.name}/" + str(target.relative_to(out_dir)).replace("\\", "/")
    return None

#查找 cameras.json 文件的路径
def _find_cameras(out_dir: Path) -> str | None:
    target = out_dir / "cameras.json"
    if target.exists():
        return f"/outputs/{out_dir.name}/" + str(target.relative_to(out_dir)).replace("\\", "/")
    return None

# 为 3D viewer 生成 URL 的端点
@app.get("/viewer/{job_id}")
def viewer(job_id: str):
    out_dir = C.OUTPUT_DIR / job_id
    if not out_dir.exists(): raise HTTPException(404, "not found")
    
    ply_path = _find_point_cloud(out_dir)
    
    base_url = "http://localhost:8000"
    absolute_ply_url = f"{base_url}{ply_path}" if ply_path else ""
    
    # 为查看器 URL 准备查询参数
    q = {
        "url": absolute_ply_url,   # Standard
        "load": absolute_ply_url,  # PlayCanvas specific
        "asset": absolute_ply_url, # Legacy
        "file": absolute_ply_url,  # Common
        "mode": "center",          # Center camera
    }
    
    base_editor = C.GS_EDITOR_URL
    full_url = f"{base_editor}?{urllib.parse.urlencode(q)}"
    
    print(f"DEBUG: Generated Viewer URL: {full_url}") # Check your terminal logs for this!

    return {"job_id": job_id, "editor_url": full_url}

#获取特定作业的详细结果/状态的端点
@app.get("/result/{job_id}")
def result(job_id: str):
    # 在内存字典中检查作业状态
    data = JOBS.get(job_id)
    if not data: # 如果未找到，则检查磁盘上的状态文件
        status_file = C.OUTPUT_DIR / job_id / "status.json"
        if status_file.exists():
            try:
                disk_status = json.loads(status_file.read_text(encoding="utf-8"))
                zip_path = (C.OUTPUT_DIR / job_id).parent / f"{job_id}.zip"
                disk_status["zip_url"] = f"/outputs/{zip_path.name}" if zip_path.exists() else None
                disk_status["job_id"] = job_id
                return disk_status
            except: pass
        return {"error": "job not found"}
    return data

#删除项目及其所有关联文件的端
@app.delete("/delete/{job_id}")
def delete_project(job_id: str):
    if job_id in JOBS: del JOBS[job_id]
    try:
        # 从磁盘中删除所有关联的目录和文件
        if (C.UPLOAD_DIR / job_id).exists(): shutil.rmtree(C.UPLOAD_DIR / job_id)
        if (C.OUTPUT_DIR / job_id).exists(): shutil.rmtree(C.OUTPUT_DIR / job_id)
        zip_file = C.OUTPUT_DIR / f"{job_id}.zip"
        if zip_file.exists(): zip_file.unlink()
        log_file = C.LOG_DIR / f"{job_id}.log"
        if log_file.exists(): log_file.unlink()
        return {"status": "deleted", "job_id": job_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- 3. 重建逻辑 ---
def _async_reconstruct(job_id, scene, upload_type, img_dir, work_dir, out_dir, log_file):
    JOBS[job_id] = {"job_id": job_id, "scene": scene, "stage": "running", "done": False, "log_url": f"/logs/{log_file.name}"}
    try:
        result = R.reconstruct(images_dir=img_dir, work_dir=work_dir, out_dir=out_dir, log_file=log_file)
        zip_path = zip_dir(out_dir, out_dir.parent / f"{job_id}.zip")
        JOBS[job_id].update({
            "done": True, 
            "stage": "Done", 
            "exit_code": result.get("exit_code", -1), 
            "zip_url": f"/outputs/{zip_path.name}",
            "command": result.get("command")
        })
    except Exception as e:
        JOBS[job_id].update({"done": True, "stage": "Failed", "error": str(e), "exit_code": -1})

#用于从上传的文件开始新重建作业reconstruction的端点
@app.post("/reconstruct_stream")
async def reconstruct_stream(
    files: List[UploadFile] = File(...),
    scene_name: Optional[str] = Form(None),
    upload_type: str = Form("files"),
):
    # 清理场景名称以用作作业 ID 或生成一个唯一的 ID
    if scene_name:
        import re
        cleaned = re.sub(r"[^A-Za-z0-9_-]", "_", scene_name.strip()) or "scene"
        job_id = cleaned
    else:
        job_id = make_job_id("recon")
    
    # 定义作业文件的路径
    job_root = C.UPLOAD_DIR / job_id
    img_dir = job_root / "input"
    work_dir = job_root / "work"
    out_dir = C.OUTPUT_DIR / job_id
    log_file = C.LOG_DIR / f"{job_id}.log"

    # 处理文件上传：保存单个文件或解压缩 zip 存档
    if upload_type == "zip":
        tmp = await save_upload_files(files, job_root)
        extract_zip(tmp[0], img_dir)
    else:
        await save_upload_files(files, img_dir)

    th = threading.Thread(target=_async_reconstruct, args=(job_id, scene_name or job_id, upload_type, img_dir, work_dir, out_dir, log_file), daemon=True)
    th.start()

    return {
        "job_id": job_id,
        "scene": scene_name or job_id,
        "upload_type": upload_type,
        "log_url": f"/logs/{log_file.name}",
        "status_url": f"/result/{job_id}",
    }


# --- 4. 捕获所有路由 ---
_frontend_dist = C.BASE_DIR / "frontend-react" / "dist"

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    if full_path.startswith(("api/", "outputs", "logs", "uploads", "reconstruct", "projects", "status", "result", "health", "viewer", "gs_editor")):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    
    file_path = _frontend_dist / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))
    
    if "." in full_path.split("/")[-1]:
         return JSONResponse(status_code=404, content={"detail": "Asset not found"})

    if _frontend_dist.exists():
        return FileResponse(str(_frontend_dist / "index.html"))
        
    return JSONResponse(status_code=404, content={"error": "Frontend not built"})

# --- 主执行块 ---
if __name__ == "__main__":
    import uvicorn
    print("--- STARTING SERVER V8 (HARDCODED URL + NO 422 ERROR) ---")
    uvicorn.run(app, host=C.HOST, port=8000)
