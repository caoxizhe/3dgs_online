from __future__ import annotations

import os
import shlex
import subprocess
from pathlib import Path
from typing import Dict, Optional

from . import config as C


def build_command(
    images_dir: Path,
    work_dir: Path,
    out_dir: Path,
) -> str:
    # Prefer user-defined template for maximum compatibility
    if C.RECON_CMD_TEMPLATE:
        return C.RECON_CMD_TEMPLATE.format(
            images=str(images_dir),
            work=str(work_dir),
            out=str(out_dir),
            gs=str(C.GAUSSIAN_SPLATTING_DIR),
            py=str(C.PYTHON_EXE),
            colmap=str(C.COLMAP_BIN),
        )

    # Fallback: assume there's a run_colmap.sh in repo root with positional args:
    #   bash run_colmap.sh <images_dir> <work_dir> <out_dir>
    # Then assume training call is managed inside that script or its pipeline.
    # Adjust this to your local script if needed via GS_RECON_CMD.
    repo_root = C.BASE_DIR.parent
    script = repo_root / "run_colmap.sh"
    cmd = f"bash {shlex.quote(str(script))} {shlex.quote(str(images_dir))} {shlex.quote(str(work_dir))} {shlex.quote(str(out_dir))}"
    return cmd


def run_command_bash(cmd: str, cwd: Optional[Path], log_file: Path) -> int:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    with log_file.open("w", encoding="utf-8") as lf:
        lf.write(f"COMMAND: {cmd}\nCWD: {cwd}\n\n")
        lf.flush()
        # Use bash -lc to ensure bash semantics on systems where default shell may differ.
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
        for line in proc.stdout:
            lf.write(line)
        proc.wait()
        lf.write(f"\nEXIT_CODE: {proc.returncode}\n")
        return proc.returncode


def reconstruct(
    images_dir: Path,
    work_dir: Path,
    out_dir: Path,
    log_file: Path,
) -> Dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    cmd = build_command(images_dir=images_dir, work_dir=work_dir, out_dir=out_dir)
    code = run_command_bash(cmd, cwd=C.BASE_DIR.parent, log_file=log_file)

    result = {
        "exit_code": code,
        "command": cmd,
        "work_dir": str(work_dir),
        "out_dir": str(out_dir),
        "log_file": str(log_file),
    }
    return result