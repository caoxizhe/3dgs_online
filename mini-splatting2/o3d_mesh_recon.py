import open3d as o3d

# 加载点云（含法向量）
pcd = o3d.io.read_point_cloud("/data0/sumai/mini-splatting2/outputs/lidazhao_7/point_cloud/iteration_18000/cut-point_cloud_with_normals_ascii_float.ply")

# 重建网格
mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=9)

# 可选：去掉低密度面片
import numpy as np
vertices_to_remove = densities < np.quantile(densities, 0.01)
mesh.remove_vertices_by_mask(vertices_to_remove)

# 保存
o3d.io.write_triangle_mesh("/data0/sumai/mini-splatting2/outputs/lidazhao_7/point_cloud/iteration_18000/poisson_mesh_open3d.ply", mesh)
