from __future__ import annotations

import shlex
from pathlib import Path
from typing import Dict, Optional

from . import config as C
from .utils import write_status


def _run(cmd: str, cwd: Optional[Path], log_file: Path, header: str) -> int:
    """Run a shell command and append stdout/stderr to log_file. Return exit code."""
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
    work_dir: Path,  # 保留以兼容调用，但本实现使用 dataset_root
    out_dir: Path,
    log_file: Path,
) -> Dict:
    """Run gaussian-splatting pipeline using convert.py and train.py.

    Expected layout:
      images_dir -> .../data/uploads/<job-id>/images/
      dataset_root = images_dir.parent

    Steps:
      1. cd gaussian-splatting
      2. python convert.py -s <dataset_root>
      3. python train.py -s <dataset_root> -m <out_dir>
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset_root = images_dir.parent

    # 写入初始状态
    status_path = out_dir / "status.json"
    write_status(status_path, {"stage": "init", "ts": str(Path().stat().st_mtime)})

    # Step 1: run convert.py
    # 新布局下，前端已上传到 dataset_root/input，因此无需创建链接
    input_dir = dataset_root / "input"
    if not input_dir.exists():
        return {
            "exit_code": 1,
            "stage": "precheck",
            "command": "",
            "dataset_root": str(dataset_root),
            "out_dir": str(out_dir),
            "log_file": str(log_file),
        }
    write_status(status_path, {"stage": "convert", "message": "Running COLMAP", "progress": 0})

    cmd_convert = f"{shlex.quote(C.PYTHON_EXE)} convert.py -s {shlex.quote(str(dataset_root))}"
    code_convert = _run(cmd_convert, cwd=C.GAUSSIAN_SPLATTING_DIR, log_file=log_file, header="CONVERT")
    # convert.py 可能在内部用大于255的退出码导致外层看到 0，这里做产物校验增强稳健性
    sparse0 = dataset_root / "sparse" / "0"
    undist_images = dataset_root / "images"
    if code_convert != 0 or not sparse0.exists() or not undist_images.exists():
        write_status(status_path, {"stage": "convert_failed", "exit_code": code_convert})
        return {
            "exit_code": code_convert or 1,
            "stage": "convert",
            "command": cmd_convert,
            "dataset_root": str(dataset_root),
            "out_dir": str(out_dir),
            "log_file": str(log_file),
        }

    # Step 2: run train.py
    write_status(status_path, {"stage": "train", "message": "Training 3DGS", "progress": 0})
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