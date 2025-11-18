from __future__ import annotations

import os
import time
from typing import List

import gradio as gr
import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")


def do_reconstruct(files: List[str], scene_name: str):
    if not files:
        return "请先选择图片文件。", None

    # Upload to backend
    multipart = []
    for f in files:
        multipart.append(("files", (os.path.basename(f), open(f, "rb"), "image/jpeg")))
    data = {}
    if scene_name:
        data["scene_name"] = scene_name

    try:
        resp = requests.post(f"{BACKEND_URL}/reconstruct", files=multipart, data=data, timeout=None)
        if resp.status_code != 200:
            return f"后端返回错误：{resp.status_code} {resp.text}", None
        js = resp.json()
    except Exception as e:
        return f"请求失败：{e}", None

    # Build result text and link
    job_id = js.get("job_id")
    exit_code = js.get("exit_code")
    log_url = f"{BACKEND_URL}{js.get('log_url')}"
    zip_url = f"{BACKEND_URL}{js.get('zip_url')}"
    out_url = f"{BACKEND_URL}{js.get('output_dir')}"

    md = f"""
- 任务ID：{job_id}
- 退出码：{exit_code}
- 日志：{log_url}
- 输出目录（浏览器可访问）：{out_url}
- 输出压缩包：{zip_url}
"""
    return md, zip_url


with gr.Blocks(title="3DGS Online") as demo:
    gr.Markdown("# 3DGS 在线重建")
    with gr.Row():
        files = gr.Files(label="上传多张图片（同一场景）", file_count="multiple", type="filepath")
        scene_name = gr.Textbox(label="场景名称（可选）", placeholder="如：family_01")
    btn = gr.Button("重建")
    out_md = gr.Markdown()
    out_file = gr.File(label="输出压缩包下载", interactive=False)

    btn.click(fn=do_reconstruct, inputs=[files, scene_name], outputs=[out_md, out_file])

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=int(os.getenv("FRONTEND_PORT", "7860")))