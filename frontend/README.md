# 纯 JavaScript 前端 (frontend)

本目录采用原生 HTML + ES Module JS 重构，替换原先的 Gradio `app.py`。目标：

1. 保留原逻辑：上传 (files / folder / zip)、scene_name、自定义 job_id、调用 `/reconstruct_stream`、轮询 `/result/{job_id}`、查看日志、打开 `/viewer/{job_id}`。
2. 不再通过 Gradio 回传日志；日志直接前端轮询 `/logs/<job_id>.log`。
3. 引入 `frontend-react` 中的新增交互：卡片样式、删除按钮、状态徽章、缩略图占位等。

## 主要文件

- `index.html`：页面骨架与样式（无构建步骤）。
- `static/js/main.js`：核心逻辑（上传、轮询、日志弹窗、viewer 打开、删除）。

## 使用方式

后端已通过 FastAPI 暴露服务，确保其运行。例如：

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

然后用任意静态服务器或 Nginx 指向本目录（或直接从后端再新增一个 StaticFiles 挂载）。例如临时：

```bash
python -m http.server 9000 --directory ./frontend
```

访问：`http://localhost:9000/index.html`。如后端不在默认地址，可在浏览器控制台执行：

```js
localStorage.setItem('BACKEND_URL','http://你的后端:端口'); location.reload();
```

## 环境变量

`main.js` 默认使用：

1. `window.BACKEND_URL`（可在 `<script>` 里预置）。
2. 失败时回退为 `localStorage.getItem('BACKEND_URL')`。
3. 最后回退默认 `http://127.0.0.1:8000`。

## 后续可选改进

- 与后端新增 `/delete/{job_id}` 路由配合彻底删除磁盘数据（当前前端已尝试调用）。
- 引入轻量状态管理（如 Proxy + 订阅）简化 render。
- 加入图片缩略图生成（从输入图片中取一张 base64 展示）。
- 添加响应式布局更丰富的断点样式或深色主题切换。

