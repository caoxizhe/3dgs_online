from __future__ import annotations

import shlex
import shutil
import os
from pathlib import Path
from typing import Dict, Optional

from . import config as C
from .utils import write_status


def _run(cmd: str, cwd: Optional[Path], log_file: Path, header: str) -> int:
    """运行一个 shell 命令，并将 stdout/stderr 追加到 log_file，返回退出代码。"""
    log_file.parent.mkdir(parents=True, exist_ok=True)
    with log_file.open("a", encoding="utf-8") as lf:
        lf.write(f"\n===== {header} =====\n")
        lf.write(f"CMD: {cmd}\nCWD: {cwd}\n\n")
    import subprocess

    proc = subprocess.Popen(
        ["bash", "-lc", cmd],
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )
    assert proc.stdout is not None
    with log_file.open("a", encoding="utf-8") as lf:
        for line in proc.stdout:
            lf.write(line)
    proc.wait()
    with log_file.open("a", encoding="utf-8") as lf:
        lf.write(f"\nEXIT_CODE: {proc.returncode}\n")
    return proc.returncode


def reconstruct(
    images_dir: Path,
    work_dir: Path, 
    out_dir: Path,
    log_file: Path,
) -> Dict:
    """运行gs pipeline, 如果 sparse/0 目录已存在，则自动跳过 COLMAP 步骤"""
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset_root = images_dir.parent
    # images_dir is usually ".../input"

    # 写入初始状态到 status.json 文件
    status_path = out_dir / "status.json"
    write_status(status_path, {"stage": "init", "ts": str(Path().stat().st_mtime)})


    #检查是否有 sparse 目录在输入目录中    
    found_sparse = None
    # Search in input directory
    if images_dir.exists():
        for root, dirs, files in os.walk(images_dir):
            if "sparse" in dirs:
                found_sparse = Path(root) / "sparse"
                break
    
     # 如果找到了 'sparse' 文件夹，则移动其父目录的内容到数据集根目录
    if found_sparse and found_sparse.exists():
        with log_file.open("a") as f: 
            f.write(f"\n[INFO] Found 'sparse' folder at: {found_sparse}\nMoving files to dataset root...\n")

        source_root = found_sparse.parent

        for item in source_root.iterdir():
            # 如果项目本身就是目标目录，则不要移动
            if item.resolve() == dataset_root.resolve():
                continue
                
            target = dataset_root / item.name
            if not target.exists():
                try:
                    shutil.move(str(item), str(dataset_root))
                    with log_file.open("a") as f: f.write(f"Moved {item.name} -> {dataset_root}\n")
                except Exception as e:
                    with log_file.open("a") as f: f.write(f"Failed to move {item.name}: {e}\n")

    # 检查现在根目录下是否有所需的 COLMAP 输出
    sparse0 = dataset_root / "sparse" / "0"
    
    # --- STEP 1: CONVERT (COLMAP) ---
    if sparse0.exists():
        # 如果数据已存在，则跳过 convert.py 步骤
        msg = "Found existing COLMAP data (sparse/0). Skipping convert.py."
        print(msg)
        with log_file.open("a") as f: f.write(f"\n[INFO] {msg}\n")
        
        write_status(status_path, {"stage": "convert", "message": "Skipped COLMAP (Data found)", "progress": 100})
        code_convert = 0
        cmd_convert = "(skipped)"
    else:
        # 运行 COLMAP 进行转换
        write_status(status_path, {"stage": "convert", "message": "Running COLMAP...", "progress": 0})
        
        # IMPORTANT: Use xvfb-run -a to prevent Qt crash on headless servers
        cmd_convert = f"xvfb-run -a {shlex.quote(C.PYTHON_EXE)} convert.py -s {shlex.quote(str(dataset_root))}"
        
        code_convert = _run(cmd_convert, cwd=C.GAUSSIAN_SPLATTING_DIR, log_file=log_file, header="CONVERT")

        # 检查结果
        if code_convert != 0:
            write_status(status_path, {"stage": "convert_failed", "exit_code": code_convert})
            return {
                "exit_code": code_convert,
                "stage": "convert",
                "command": cmd_convert,
                "dataset_root": str(dataset_root),
                "out_dir": str(out_dir),
                "log_file": str(log_file),
            }

     # --- 步骤 2: 训练 (3DGS) ---
    write_status(status_path, {"stage": "train", "message": "Training 3DGS...", "progress": 0})
    
    cmd_train = f"{shlex.quote(C.PYTHON_EXE)} train.py -s {shlex.quote(str(dataset_root))} -m {shlex.quote(str(out_dir))}"
    
    code_train = _run(cmd_train, cwd=C.GAUSSIAN_SPLATTING_DIR, log_file=log_file, header="TRAIN")
    write_status(status_path, {"stage": "done" if code_train == 0 else "train_failed", "exit_code": code_train})

    return {
        "exit_code": code_train,
        "stage": "train" if code_train != 0 else "done",
        "command": cmd_train,
        "dataset_root": str(dataset_root),
        "out_dir": str(out_dir),
        "log_file": str(log_file),
    }