import open3d as o3d
import numpy as np
# 读取原始无法向量点云
pcd = o3d.io.read_point_cloud("/data0/sumai/mini-splatting2/outputs/lidazhao_7/point_cloud/iteration_18000/cut-point_cloud.ply")

# 估计法向量
pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.05, max_nn=30))

# 将坐标和法向量都转换为 float32
pcd.points = o3d.utility.Vector3dVector(np.asarray(pcd.points, dtype=np.float32))
pcd.normals = o3d.utility.Vector3dVector(np.asarray(pcd.normals, dtype=np.float32))

# 可视化查看
# o3d.visualization.draw_geometries([pcd], point_show_normal=True)

# 保存为带法向量的 PLY 文件
o3d.io.write_point_cloud("/data0/sumai/mini-splatting2/outputs/lidazhao_7/point_cloud/iteration_18000/cut-point_cloud_with_normals.ply", pcd, write_ascii=True)
