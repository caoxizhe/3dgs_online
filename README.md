# 3DGS Online

前后端分离的 3D Gaussian Splatting 重建演示。前端（Gradio）上传图片，后端（FastAPI）在服务器上调用 COLMAP + gaussian-splatting 完成重建，并提供可下载的结果。

## TODO
1. 优化ui界面
2. 实现通过点击.ply文件自动打开gs_editor的功能

## 目录结构
- backend/ 后端服务（FastAPI）
- frontend/ 前端（Gradio）
- data/uploads 临时任务与原始图片
- data/outputs 每个任务的重建结果

## 安装依赖
```bash
conda create -n 3dgs_online python=3.8.20
conda activate 3dgs_online
pip install -r requirements.txt
```

## 安装子项目的依赖

1. gs_editor

确保已经安装了node和npm，如果没有，可以按照以下命令安装

```bash
mkdir -p ~/.nvm
cd ~/.nvm
wget http://github.com/nvm-sh/nvm/archive/refs/tags/v0.39.4.tar.gz
tar -xzf v0.39.4.tar.gz
# 移动文件位置
mv nvm-0.39.4/* ~/.nvm/
mv nvm-0.39.4/.* ~/.nvm/ 2>/dev/null || true

# 打开 bashrc 配置文件
nano ~/.bashrc

# 在文件末尾添加以下内容
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# 重新加载配置
source ~/.bashrc

# 检查 nvm 是否安装成功，应输出版本号0.39.4
nvm --version


# 使用nvm安装最新的 Node.js 版本（包含 npm）
nvm install node

# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version

# 如果都显示版本号则安装成功
```

在安装完npm之后，在gs_editor文件夹下安装依赖
```bash
npm install
npm install rollup --save-dev
npm install serve --save-dev

# 构建项目
npm run build

# 运行项目
npm run serve

# 应该能看到gs_editor的在线网站，打开链接即可
```

2. gaussian-splatting

安装colmap
```bash
conda install -c conda-forge colmap=3.8
# 检查是否安装成功
colmap -h

# 如果在运行colmap的时候遇到关于ceres_solver和suitesparse的报错问题，可以尝试降低版本（我就是这么解决的）
conda install -c conda-forge ceres-solver=2.1.0 suitesparse=5.10.1
```

安装gaussian-splatting相关依赖
```bash
cd gaussian-splatting
conda env update -f my-environment.yml

# 如果日志中显示缺少了某些依赖项，请自己手动补装一下
# 例如gaussian-splatting的子模块
# 可以如下方式安装
cd 3dgs_online/gaussian-splatting/submodules/diff-gaussian-rasterization
pip install .
```

## 运行网站 (后端 + 前端)

1. 启动后端（服务器）

```bash
conda activate 3dgs_online
python -m backend.main
```

2. 启动前端（网页）

```bash
conda activate 3dgs_online
python frontend/app.py
```
4. 使用流程

（1）打开前端页面

（2）上传同一场景多张图片（也支持上传文件夹、zip格式压缩包）

（3）输入场景名称（可选）

（4）点击“重建”

（5）等待后端执行完成（同步阻塞）

（6）查看日志、下载结果 zip

5. 输出与文件位置

- 上传图片：3dgs_online/data/uploads/job-id/input/

- 工作目录：3dgs_online/data/uploads/job-id

- 结果目录：3dgs_online/data/outputs/job-id/

- 压缩包：3dgs_online/data/outputs/job-id.zip

- 日志：3dgs_online/data/logs/job-id.log

6. 浏览与自动加载 (gs_editor 集成)

训练完成后结果区会出现“浏览 (gs_editor)”按钮与一个跳转链接。点击后会打开 gs_editor，并自动加载：
- 点云: point_cloud.ply (迭代30000)
- 相机: cameras.json
- 原始图片: /uploads/<job-id>/input 下探测到的若干图片

实现机制：
- 后端新增 /viewer/{job_id} 接口返回编辑器跳转 URL，包含 ply / cameras / images 查询参数。
- 前端在任务完成后请求该接口，将链接追加到结果 Markdown 中。
- gs_editor 在 index.html 中解析查询参数，将其写入 window.__GS_PRELOAD__。
- 运行时在 main.ts 中调用 runPreload(events) 自动触发加载（PLY 与 cameras 通过现有 import 事件）。

环境变量：
- GS_EDITOR_URL 设置编辑器基础路径（默认 /gs_editor/dist/index.html）。

注意：图片当前仅做存在性探测与日志输出，若需要贴图或缩略图展示，可在 preload.ts 中扩展实际加载逻辑。

6. 浏览结果（gs_editor 集成）

训练完成后可点击“浏览 (gs_editor)” 按钮跳转内置编辑器，自动尝试加载：
- point_cloud.ply （迭代30000生成）
- cameras.json （相机参数）
- 原始图片目录 /uploads/<job-id>/input/

配置：
- 后端环境变量 `GS_EDITOR_URL` 可覆盖编辑器入口（默认 /gs_editor/dist/index.html）。
- 若你部署 gs_editor 为独立域名，设置该变量为完整 URL。

注意：当前 editor 自动加载逻辑为初步实现（在 dist/index.html 中解析 URL 查询参数并将其写入 window.__GS_PRELOAD__，可在 index.js 中扩展实际加载函数）。

## 7. “浏览 (gs_editor)” 按钮完整跳转逻辑说明

本节面向第一次接触本项目的使用者或需要排障的维护者，详细说明前端 `view_btn.js` 点击后如何打开 3D 高斯编辑 / 查看器。

### 总流程概览
1. 用户在前端（Gradio）看到某个任务 `job_id` 的结果后，点击 “浏览 (gs_editor)” 按钮。
2. 按钮的点击处理函数（`frontend/static/js/view_btn.js` 里定义）开始执行：
	 - 构建一个顶部“诊断条”显示状态、支持复制调试报告。
	 - 解析或推断出当前任务的 `job_id`。
	 - 请求后端 `/viewer/{job_id}` 获取跳转所需的 `editor_url`（里面已经包含 ply / cameras / images 查询参数）。
	 - 打开新的浏览器标签页访问该 `editor_url`（指向 `gs_editor/dist/index.html?ply=...&cameras=...&images=...`）。
	 - 在新标签页中，`gs_editor/dist/index.html` 预加载脚本读取查询参数并注入 `window.__GS_PRELOAD__` 与 `window.__GS_IMAGES_BASE__`，随后运行主脚本 `index.js` 自动导入点云与相机数据、预加载图片。

### 每一步的细节

#### 1. 诊断条初始化
点击后若页面尚无诊断条，会插入一个固定在顶部的条：
```
<div id="viewer-diagnostics">Viewer ... 复制报告</div>
```
里面会实时显示步骤（init / build_urls / 获取链接 …），并在失败时留下错误信息。
“复制报告”按钮会把内部收集的步骤与最近的响应打包成 JSON 复制到剪贴板，方便发给维护者定位问题。

#### 2. job_id 的来源
- 首选：调用按钮时就传入 `job`。
- 备选：在结果列表 DOM 中查找日志链接 `/logs/<job_id>.log` 的文本模式以正则提取。
若无法获得 `job_id`，会弹出提示并终止流程。

#### 3. 访问 /viewer/{job_id}
构造两个候选 URL：
- 绝对：`{BACKEND_URL}/viewer/{job_id}`（BACKEND_URL 在前端启动时注入）
- 相对：`/viewer/{job_id}`（用于同域回退）
依次尝试 fetch，若返回 200 且 JSON 中包含 `editor_url` 字段，则视为成功。

#### 4. 回退策略（当 /viewer 失败时）
如果两种 /viewer 请求都失败：
- 继续尝试 `/result/{job_id}`（后端已有返回任务产出信息的接口）。
- 在该 JSON 里递归查找：
	- 第一个匹配 `*.ply` 的字符串 → 作为点云文件 URL
	- 第一个匹配 `cameras.json` 的字符串 → 作为相机文件 URL
	- 匹配 `uploads/<job_id>/input` 形式的目录 → 作为图片根目录（若找不到就默认 `/uploads/<job_id>/input`）
- 组装 `editor_url = /gs_editor/dist/index.html?ply=...&cameras=...&images=...`

如果仍无法组装出 `editor_url`，会显示失败并提供一个“基础页”链接 `/gs_editor/dist/index.html` 让用户至少进入编辑器空页。

#### 5. 新标签页打开
成功获取 `editor_url` 后：
- 在诊断条添加一个可点击的兜底链接。
- 使用 `window.open(editor_url, '_blank', 'noopener')` 打开新标签。
（这样避免旧逻辑使用 data:URL 中转导致的部分浏览器空白页问题。）

#### 6. 编辑器页面内的自动加载
打开的 URL 如：
```
/gs_editor/dist/index.html?ply=/outputs/<job>/point_cloud/iteration_30000/point_cloud.ply&cameras=/outputs/<job>/cameras.json&images=/uploads/<job>/input
```
在 `index.html` 中的预加载脚本：
1. 解析 `ply`、`cameras`、`images` 参数。 
2. 设置：
	 - `window.__GS_PRELOAD__ = { plyUrl, camerasUrl }`
	 - `window.__GS_IMAGES_BASE__ = <images 基路径>`
3. 主脚本 `index.js` 自动调用内部导入逻辑：
	 - 导入点云（PLY）与相机关键帧（cameras.json）
4. 附加脚本再读取 cameras.json，根据每条记录的 `img_name` 拼出 `<images>/<img_name>` 顺序预加载图片，并将列表存入 `window.__GS_IMAGE_LIST__`。

### 常见问题与排查指引
| 症状 | 可能原因 | 排查步骤 |
|------|----------|----------|
| 新标签页空白且无网络请求 | 浏览器阻止弹窗或编辑器构建/路径错误 | 查看原页面诊断条是否有“已在新标签页打开”文字；尝试手点兜底链接；确认 `gs_editor/dist/index.html` 真实存在且静态服务正常。 |
| 诊断条显示“自动获取链接失败” | /viewer 与 /result 接口都失败 | 在浏览器 Network 面板检查对应请求状态码；后端日志是否出现 404/500；验证 BACKEND_URL 配置。 |
| 点云未显示 | ply 参数错误或文件不可访问 | 在新标签页控制台看是否有 fetch 404；直接访问该 ply URL 测试。 |
| 相机关键帧未加载 | cameras.json 格式不符合预期或路径错误 | 打开 cameras.json URL 看是否返回数组或包含 poses；查看控制台是否有 JSON 解析异常。 |
| 图片未预加载 | `img_name` 与目录下文件不匹配 | 列出 `/uploads/<job>/input` 实际文件名；确认大小写与后缀；检查控制台 `[auto images] failed` 日志。 |
| 打开速度很慢 | 网络延迟或图片过多 | 观察诊断条时间节点；可按需减少初始图片数量或延迟图片加载逻辑。 |

### 最少可运行条件
要让查看器成功加载并显示点云 + 相机：
1. /viewer/{job_id} 返回 JSON 中必须包含 `editor_url`，或 /result/{job_id} 中能找到 ply 与 cameras.json。
2. 这两个文件路径从浏览器直接访问必须为 200 OK（确保后端静态文件映射正确）。
3. 编辑器构建产物目录 `/gs_editor/dist/` 已经在后端挂载为静态资源。

### 建议的后端 /viewer/{job_id} 响应示例
```json
{
	"editor_url": "/gs_editor/dist/index.html?ply=/outputs/test_8/point_cloud/iteration_30000/point_cloud.ply&cameras=/outputs/test_8/cameras.json&images=/uploads/test_8/input"
}
```
后端无需返回其他字段；前端只解析此一个 key。

### 如何扩展
- 若需要在编辑器里真正显示图片缩略图或贴图，而不仅是预加载，将 `window.__GS_IMAGE_LIST__` 接入编辑器内部的纹理/时间线模块。可新增一个自定义 import 事件，例如：
	```js
	window.__GS_IMAGE_LIST__.forEach(({frame, url}) => {/* attach texture / frame mapping */});
	```
- 可在后端生成一个清单文件（例如 images.json）包含图片顺序与元数据，前端读取后替代基于 cameras.json 的推断。

### 发生异常时请收集
1. 原页面诊断条“复制报告”输出。
2. 浏览器开发者工具 Network 中 /viewer 与 /result 请求的状态码与响应体。
3. 新标签页控制台的错误堆栈。
4. 后端终端日志对应时间段记录。

将以上信息一起反馈即可快速定位问题。

