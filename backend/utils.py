from __future__ import annotations

import io
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

from fastapi import UploadFile


def make_job_id(prefix: str = "job") -> str:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    u8 = uuid.uuid4().hex[:8]
    return f"{prefix}-{ts}-{u8}"


async def save_upload_files(files: List[UploadFile], dest_dir: Path) -> List[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved: List[Path] = []
    for f in files:
        # name may include path on some browsers; keep basename only
        name = Path(f.filename or "upload.bin").name
        out_path = dest_dir / name
        with out_path.open("wb") as w:
            while True:
                chunk = await f.read(1024 * 1024)
                if not chunk:
                    break
                w.write(chunk)
        await f.close()
        saved.append(out_path)
    return saved


def zip_dir(src_dir: Path, out_zip_path: Path) -> Path:
    out_zip_path.parent.mkdir(parents=True, exist_ok=True)
    base = out_zip_path.with_suffix("")  # remove .zip
    shutil.make_archive(str(base), "zip", root_dir=str(src_dir))
    return base.with_suffix(".zip")


def write_text(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")