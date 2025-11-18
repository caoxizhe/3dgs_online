# 3DGS Online

前后端分离的 3D Gaussian Splatting 重建演示。前端（Gradio）上传图片，后端（FastAPI）在服务器上调用 COLMAP + gaussian-splatting 完成重建，并提供可下载的结果。

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
```

## 运行网站 (后端 + 前端)

1. 准备重建命令
后端通过一个命令串完成 COLMAP + 数据转换 + 3DGS 训练。推荐使用环境变量 GS_RECON_CMD 自定义：

```bash
export GS_RECON_CMD='bash run_colmap.sh --images {images} --out {work}/colmap && \
  python3 ../gaussian-splatting/scripts/colmap2nerf.py -i {images} -s {work}/colmap/sparse/0 -o {work}/gs_data && \
  python3 ../gaussian-splatting/train.py -s {work}/gs_data -m {out}'
```

占位符说明：

{images} 上传的图片目录
{work} 工作目录（colmap数据库/稀疏模型等）
{out} 最终输出目录（会打包压缩）
{gs} gaussian-splatting 根目录
{py} Python 可执行路径
{colmap} COLMAP 可执行路径

2. 启动后端

```bash
conda activate 3dgs_online
export GAUSSIAN_SPLATTING_DIR="$(pwd)/../gaussian-splatting"
export COLMAP_BIN="colmap"
# 可选：export GS_RECON_CMD='...自定义命令串...'
python -m backend.main
# 或
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

3. 启动前端

```bash
conda activate 3dgs_online
export BACKEND_URL="http://127.0.0.1:8000"   # 如远程后端改成对应地址
python frontend/app.py
```
4. 使用流程
打开前端页面

上传同一场景多张图片

输入场景名称（可选）

点击“重建”

等待后端执行完成（同步阻塞）

查看日志、下载结果 zip

5. 输出与文件位置

上传图片：data/uploads/<job-id>/images/

工作目录：data/uploads/<job-id>/work/

结果目录：data/outputs/<job-id>/

压缩包：data/outputs/<job-id>.zip

日志：data/logs/<job-id>.log

6. 常用环境变量

```bash
export HOST=0.0.0.0
export PORT=8000
export GAUSSIAN_SPLATTING_DIR=/path/to/gaussian-splatting
export COLMAP_BIN=colmap
export GS_RECON_CMD='自定义重建命令串'
export BACKEND_URL=http://server:8000
```