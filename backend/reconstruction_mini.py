from __future__ import annotations

import shlex
from pathlib import Path
from typing import Dict, Optional

from . import config as C
from .utils import write_status
from .reconstruction import _run

def reconstruct_mini(
    images_dir: Path,
    work_dir: Path,  # 保留以兼容调用，但本实现使用 dataset_root
    out_dir: Path,
    log_file: Path,
) -> Dict:
    """Run mini-splatting2 pipeline: convert.py + msv2/train.py

    1. cd gaussian-splatting; python convert.py -s <dataset_root>
    2. cd mini-splatting2; python msv2/train.py -s <dataset_root> -m <out_dir> --config_path ./config/fast
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    dataset_root = images_dir.parent
    status_path = out_dir / "status.json"
    write_status(status_path, {"stage": "init", "ts": str(Path().stat().st_mtime)})

    # Step 1: run convert.py
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

    # Step 2: run mini-splatting2 training
    write_status(status_path, {"stage": "train", "message": "Training MiniGS2", "progress": 0})
    cmd_train = f"{shlex.quote(C.PYTHON_EXE)} msv2/train.py -s {shlex.quote(str(dataset_root))} -m {shlex.quote(str(out_dir))} --imp_metric outdoor --config_path ./config/fast"
    code_train = _run(cmd_train, cwd=C.BASE_DIR / 'mini-splatting2', log_file=log_file, header="MINI_TRAIN")
    write_status(status_path, {"stage": "done" if code_train == 0 else "train_failed", "exit_code": code_train})
    return {
        "exit_code": code_train,
        "stage": "train" if code_train != 0 else "done",
        "command": cmd_train,
        "dataset_root": str(dataset_root),
        "out_dir": str(out_dir),
        "log_file": str(log_file),
    }
