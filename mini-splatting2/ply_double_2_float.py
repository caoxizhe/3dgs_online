import open3d as o3d
import numpy as np
# 加载点云并估计法向量
pcd = o3d.io.read_point_cloud("/data0/sumai/mini-splatting2/outputs/lidazhao_Sofa_home/point_cloud/iteration_18000/cut_point_cloud.ply")
pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.05, max_nn=30))

# 获取点坐标和法向量
points = np.asarray(pcd.points, dtype=np.float32)
normals = np.asarray(pcd.normals, dtype=np.float32)

# 添加颜色字段（全白 RGB）
colors = np.full((points.shape[0], 3), 255, dtype=np.uint8)

# 添加 confidence 字段（全为 1.0）
conf = np.ones((points.shape[0], 1), dtype=np.float32)

# 拼接所有字段
data = np.hstack((points, normals, colors, conf))

# 写 PLY
output_path = "/data0/sumai/mini-splatting2/outputs/lidazhao_Sofa_home/point_cloud/iteration_18000/cut_point_cloud_float.ply"
with open(output_path, "w") as f:
    f.write("ply\n")
    f.write("format ascii 1.0\n")
    f.write(f"element vertex {data.shape[0]}\n")
    f.write("property float x\n")
    f.write("property float y\n")
    f.write("property float z\n")
    f.write("property float nx\n")
    f.write("property float ny\n")
    f.write("property float nz\n")
    f.write("property uchar red\n")
    f.write("property uchar green\n")
    f.write("property uchar blue\n")
    f.write("property float confidence\n")
    f.write("end_header\n")
    for row in data:
        # 注意 RGB 用 int 输出，其余 float
        float_part = " ".join(f"{v:.6f}" for v in row[:6])
        rgb_part = " ".join(str(int(v)) for v in row[6:9])
        conf_part = f"{row[9]:.6f}"
        f.write(f"{float_part} {rgb_part} {conf_part}\n")

print(f"[✓] 修复完毕: {output_path}")
