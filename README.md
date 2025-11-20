# 3DGS Online

前后端分离的 3D Gaussian Splatting 重建演示。后端（FastAPI）调用 COLMAP + gaussian-splatting 完成重建，并提供下载与查看；前端现已采用纯 HTML + 原生 JavaScript（取代旧 Gradio）。

## 目录结构
- backend/ 后端服务（FastAPI）
- frontend/ 新前端（原生 HTML + JS）
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

## 运行网站 

1. 启动后端（服务器）

```bash
conda activate 3dgs_online
python -m backend.main
```

2. 打开前端

启动后端后应该会看到如下命令行
```bash
[backend] Serving on http://0.0.0.0:8000
[frontend] Open: http://0.0.0.0:8000/frontend/index.html
```

打开前端链接即可

3. 使用流程（新前端）

（1）访问前端页面 `index.html`

（2）点击“新建”或“新任务”进入弹窗

（3）选择上传模式：Files / Folder / Zip

（4）拖拽或选择文件（Folder 模式依赖浏览器对 `webkitdirectory` 支持）

（5）填写场景名称（可选，作为 job_id）

（6）点击“开始重建”提交；任务卡片出现并显示阶段 / 状态徽章

（7）日志：点击“日志”按钮弹出实时滚动窗口（轮询 `/logs/<job>.log`）

（8）完成后：卡片显示 READY，可下载 ZIP，点“查看”打开 3D 查看器（gs_editor）

（9）可删除卡片（前端本地移除，若后端提供 `/delete/{job_id}` 则会尝试调用）

5. 输出与文件位置

- 上传图片：3dgs_online/data/uploads/job-id/input/

- 工作目录：3dgs_online/data/uploads/job-id

- 结果目录：3dgs_online/data/outputs/job-id/

- 压缩包：3dgs_online/data/outputs/job-id.zip

- 日志：3dgs_online/data/logs/job-id.log

4. 浏览与自动加载 (gs_editor 集成)

训练完成后结果区会出现“浏览 (gs_editor)”按钮与一个跳转链接。点击后会打开 gs_editor，并自动加载：
- 点云: point_cloud.ply (迭代30000)
- 相机: cameras.json
- 原始图片: /uploads/<job-id>/input 下探测到的若干图片

实现机制：
- 后端新增 /viewer/{job_id} 接口返回编辑器跳转 URL，包含 ply / cameras / images 查询参数。
- 前端在任务完成后请求该接口，将链接追加到结果 Markdown 中。
- gs_editor 在 index.html 中解析查询参数，将其写入 window.__GS_PRELOAD__。
- 运行时在 main.ts 中调用 runPreload(events) 自动触发加载（PLY 与 cameras 通过现有 import 事件）。

环境变量 / 配置：
- GS_EDITOR_URL：后端中设置编辑器基础路径（默认 `/gs_editor/dist/index.html`）。
- BACKEND_URL：前端可通过 `localStorage` 或 `window.BACKEND_URL` 指定后端根 URL。




## 使用其他优化实现（如 miniGauss / gsplat 等）

后端已支持通过环境变量覆盖默认流水线，你可以不使用本仓库自带的 `gaussian-splatting`，而是切换到优化过的实现（例如 miniGauss）。核心做法：

1) 指定外部实现所在目录（作为“引擎根目录”）
- 设置环境变量 `GAUSSIAN_SPLATTING_DIR` 指向你的实现根目录，例如 miniGauss 的代码根目录。

2) 用一条可配置的命令模板替换默认的 convert+train 流程
- 设置环境变量 `GS_RECON_CMD`（后端读取为 `config.RECON_CMD_TEMPLATE`）。
- 该模板在运行时会使用以下占位符进行替换：
	- `{images}`：原始输入图片目录（例如 …/data/uploads/<job>/input）
	- `{work}`：工作目录（例如 …/data/uploads/<job>/work）
	- `{out}`：输出目录（例如 …/data/outputs/<job>）
	- `{gs}`：你设置的“引擎根目录”（即 `GAUSSIAN_SPLATTING_DIR`）
	- `{py}`：Python 可执行文件（`config.PYTHON_EXE`）
	- `{colmap}`：COLMAP 可执行名或绝对路径（`config.COLMAP_BIN`）

3) 配置查看器需要的产物路径
- 若你的实现输出的点云/相机文件路径与默认不一致，请设置：
	- `PLY_REL_PATH`：相对于输出目录（`{out}`）的点云 .ply 路径；默认 `point_cloud/iteration_30000/point_cloud.ply`
	- `CAMERAS_REL_PATH`：相对输出目录的相机参数（例如 `cameras.json`）；默认 `cameras.json`

### 快速示例

以下示例展示了如何在 shell 中临时切换为“自定义引擎”，并用一条命令完成数据准备与训练（请根据你的仓库实际脚本调整路径与参数）。

示例 A：使用自带 convert，再调用外部实现的训练脚本
```bash
export GAUSSIAN_SPLATTING_DIR=/abs/path/to/minigauss
export GS_RECON_CMD='\
	{py} {gs}/convert.py -s {work} \
	&& {py} {gs}/train.py -s {work} -m {out} \
'

# 若产物结构不同，设置查看器路径（示例：miniGauss 输出到 out/point_cloud/point_cloud.ply 与 out/cameras.json）
export PLY_REL_PATH="point_cloud/point_cloud.ply"
export CAMERAS_REL_PATH="cameras.json"

python -m backend.main
```

示例 B：完全自定义一条流水线（包含 COLMAP 步骤）
```bash
export GAUSSIAN_SPLATTING_DIR=/abs/path/to/your-engine
export GS_RECON_CMD='\
	{colmap} feature_extractor --database_path {work}/colmap.db --image_path {images} && \
	{colmap} exhaustive_matcher --database_path {work}/colmap.db && \
	mkdir -p {work}/sparse && \
	{colmap} mapper --database_path {work}/colmap.db --image_path {images} --output_path {work}/sparse && \
	{py} {gs}/tools/colmap2nerf.py -i {images} -s {work}/sparse/0 -o {work}/dataset && \
	{py} {gs}/train.py -s {work}/dataset -m {out} \
'

# 视你的引擎产物而定（若查看器读不到点云/相机，检查这两个路径）
export PLY_REL_PATH="point_cloud/iteration_30000/point_cloud.ply"
export CAMERAS_REL_PATH="cameras.json"

python -m backend.main
```

提示：
- 以上仅为示例模板，请根据外部实现的实际脚本与参数调整。
- 若你的实现不产生 `cameras.json`，查看器仍可加载点云，但相机轨迹与自动播放会缺失。
- 如需固定这些设置，可将环境变量写入启动脚本或进程管理器（systemd、supervisor、docker-compose 的 env）。

