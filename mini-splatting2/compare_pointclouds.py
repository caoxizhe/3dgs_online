import numpy as np
import open3d as o3d
import sklearn.neighbors as skln
from tqdm import tqdm
import argparse
import json

def write_vis_pcd(file, points, colors):
    """将点云和颜色写入文件"""
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    # 确保颜色值在[0,1]范围内
    colors = np.clip(colors, 0, 1)
    pcd.colors = o3d.utility.Vector3dVector(colors)
    o3d.io.write_point_cloud(file, pcd)

def compute_point_cloud_metrics(source_pcd, target_pcd, max_dist=20, visualize_threshold=10):
    """计算两个点云之间的度量"""
    # 计算source到target的距离
    nn_engine = skln.NearestNeighbors(n_neighbors=1, algorithm='kd_tree', n_jobs=-1)
    nn_engine.fit(target_pcd)
    dist_d2s, idx_d2s = nn_engine.kneighbors(source_pcd, n_neighbors=1, return_distance=True)
    mean_d2s = dist_d2s[dist_d2s < max_dist].mean()

    # 计算target到source的距离
    nn_engine.fit(source_pcd)
    dist_s2d, idx_s2d = nn_engine.kneighbors(target_pcd, n_neighbors=1, return_distance=True)
    mean_s2d = dist_s2d[dist_s2d < max_dist].mean()

    # 可视化误差 - 借鉴eval.py的颜色定义方式
    R = np.array([[1, 0, 0]], dtype=np.float64)  # 红色
    G = np.array([[0, 1, 0]], dtype=np.float64)  # 绿色
    B = np.array([[0, 0, 1]], dtype=np.float64)  # 蓝色
    W = np.array([[1, 1, 1]], dtype=np.float64)  # 白色

    # 源点云颜色 - 借鉴eval.py的方式
    source_color = np.tile(B, (source_pcd.shape[0], 1))  # 初始化为蓝色
    source_alpha = dist_d2s.clip(max=visualize_threshold) / visualize_threshold
    source_color = R * source_alpha + W * (1 - source_alpha)
    source_color[dist_d2s[:, 0] >= max_dist] = G

    # 目标点云颜色 - 借鉴eval.py的方式
    target_color = np.tile(B, (target_pcd.shape[0], 1))  # 初始化为蓝色
    target_alpha = dist_s2d.clip(max=visualize_threshold) / visualize_threshold
    target_color = R * target_alpha + W * (1 - target_alpha)
    target_color[dist_s2d[:, 0] >= max_dist] = G

    return mean_d2s, mean_s2d, source_color, target_color

def main():
    parser = argparse.ArgumentParser(description='比较两个点云文件')
    parser.add_argument('--source', type=str, required=True, help='源点云文件路径')
    parser.add_argument('--target', type=str, required=True, help='目标点云文件路径')
    parser.add_argument('--output_dir', type=str, default='comparison_results', help='输出目录')
    parser.add_argument('--max_dist', type=float, default=0.5, help='最大距离阈值')    # 根据点云的比例调整值，尺寸为1的话这个参数差不多
    parser.add_argument('--visualize_threshold', type=float, default=0.2, help='可视化阈值') # 根据点云的比例调整值，尺寸为1的话这个参数差不多
    args = parser.parse_args()

    # 创建输出目录
    import os
    os.makedirs(args.output_dir, exist_ok=True)

    # 读取点云
    print("读取点云文件...")
    source_pcd = o3d.io.read_point_cloud(args.source)
    target_pcd = o3d.io.read_point_cloud(args.target)

    # ICP对齐
    print("执行ICP对齐...")
    reg = o3d.pipelines.registration.registration_icp(
        source_pcd,
        target_pcd,
        10.0,
        np.identity(4),
        o3d.pipelines.registration.TransformationEstimationPointToPoint(True),
        o3d.pipelines.registration.ICPConvergenceCriteria(1e-6, 50),
    )
    reg2 = o3d.pipelines.registration.registration_icp(
        source_pcd,
        target_pcd,
        2.5,
        reg.transformation,
        o3d.pipelines.registration.TransformationEstimationPointToPoint(True),
        o3d.pipelines.registration.ICPConvergenceCriteria(1e-6, 50),
    )
    reg3 = o3d.pipelines.registration.registration_icp(
        source_pcd,
        target_pcd,
        0.5,
        reg2.transformation,
        o3d.pipelines.registration.TransformationEstimationPointToPoint(True),
        o3d.pipelines.registration.ICPConvergenceCriteria(1e-6, 50),
    )

    # 应用变换
    source_pcd.transform(reg3.transformation)
    
    # 转换为numpy数组
    source_points = np.asarray(source_pcd.points)
    target_points = np.asarray(target_pcd.points)

    # 计算度量
    print("计算点云度量...")
    mean_d2s, mean_s2d, source_color, target_color = compute_point_cloud_metrics(
        source_points, 
        target_points,
        args.max_dist,
        args.visualize_threshold
    )

    # 保存可视化结果
    print("保存可视化结果...")
    write_vis_pcd(f'{args.output_dir}/source_to_target.ply', source_points, source_color)
    write_vis_pcd(f'{args.output_dir}/target_to_source.ply', target_points, target_color)

    # 保存度量结果
    overall = (mean_d2s + mean_s2d) / 2
    results = {
        'mean_d2s': float(mean_d2s),
        'mean_s2d': float(mean_s2d),
        'overall': float(overall)
    }
    
    with open(f'{args.output_dir}/results.json', 'w') as fp:
        json.dump(results, fp, indent=True)

    print(f"源到目标的平均距离: {mean_d2s:.6f}")
    print(f"目标到源的平均距离: {mean_s2d:.6f}")
    print(f"总体平均距离: {overall:.6f}")

if __name__ == "__main__":
    main() 