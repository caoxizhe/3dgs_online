#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
随机选择50张图片保留，其他图片移动到deleted目录，并对保留的图片进行降采样
"""

import os
import random
import shutil
import sys
import time
from pathlib import Path
from PIL import Image

def resize_image(image_path, max_size):
    """
    调整图片尺寸，保持宽高比，最大边不超过指定尺寸
    
    Args:
        image_path: 图片文件路径
        max_size: 最大边的尺寸
    """
    try:
        with Image.open(image_path) as img:
            # 获取原始尺寸
            width, height = img.size
            
            # 计算新的尺寸，保持宽高比
            if width > height:
                new_width = max_size
                new_height = int(height * max_size / width)
            else:
                new_height = max_size
                new_width = int(width * max_size / height)
            
            # 调整图片尺寸
            resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # 保存调整后的图片（覆盖原文件）
            resized_img.save(image_path, quality=95, optimize=True)
            
            return True
    except Exception as e:
        print(f"调整图片 {image_path.name} 尺寸时出错：{e}")
        return False

def resize_images(images_dir, max_size):
    """
    批量调整图片尺寸
    
    Args:
        images_dir: 图片目录路径
        max_size: 最大边的尺寸
    """
    images_path = Path(images_dir)
    
    # 获取所有图片文件
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}
    image_files = []
    
    for file_path in images_path.iterdir():
        if file_path.is_file() and file_path.suffix.lower() in image_extensions:
            image_files.append(file_path)
    
    print(f"开始调整 {len(image_files)} 张图片的尺寸，最大边尺寸：{max_size}")
    
    # 调整每张图片的尺寸
    success_count = 0
    for i, img_path in enumerate(image_files):
        if resize_image(img_path, max_size):
            success_count += 1
        
        # 显示进度
        if (i + 1) % 10 == 0 or (i + 1) == len(image_files):
            print(f"已处理 {i + 1}/{len(image_files)} 张图片...")
    
    print(f"尺寸调整完成！成功调整了 {success_count}/{len(image_files)} 张图片")

def random_select_images(images_dir, keep_count=50, deleted_dir="deleted"):
    """
    随机选择指定数量的图片保留，其他的移动到deleted目录
    
    Args:
        images_dir: 图片目录路径
        keep_count: 保留的图片数量
        deleted_dir: 删除的图片存储目录名称
    """
    
    # 转换为Path对象
    images_path = Path(images_dir)
    deleted_path = images_path.parent / deleted_dir
    
    # 检查图片目录是否存在
    if not images_path.exists():
        print(f"错误：图片目录 {images_dir} 不存在！")
        return
    
    # 获取所有图片文件
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'}
    all_images = []
    
    for file_path in images_path.iterdir():
        if file_path.is_file() and file_path.suffix.lower() in image_extensions:
            all_images.append(file_path)
    
    print(f"找到 {len(all_images)} 张图片")
    
    # 检查图片数量
    if len(all_images) <= keep_count:
        print(f"图片总数 ({len(all_images)}) 小于或等于要保留的数量 ({keep_count})，无需删除任何图片。")
        return
    
    # 随机选择要保留的图片
    random.seed(42)  # 设置随机种子以保证结果可重现
    keep_images = set(random.sample(all_images, keep_count))
    images_to_move = [img for img in all_images if img not in keep_images]
    
    print(f"将保留 {len(keep_images)} 张图片")
    print(f"将移动 {len(images_to_move)} 张图片到 {deleted_dir} 目录")
    
    # 创建deleted目录
    deleted_path.mkdir(exist_ok=True)
    print(f"创建目录：{deleted_path}")
    
    # 移动图片到deleted目录
    moved_count = 0
    for img_path in images_to_move:
        try:
            target_path = deleted_path / img_path.name
            shutil.move(str(img_path), str(target_path))
            moved_count += 1
            if moved_count % 10 == 0:  # 每移动10张图片显示进度
                print(f"已移动 {moved_count}/{len(images_to_move)} 张图片...")
        except Exception as e:
            print(f"移动图片 {img_path.name} 时出错：{e}")
    
    print(f"操作完成！成功移动了 {moved_count} 张图片到 {deleted_dir} 目录")
    print(f"保留的图片列表已保存在原目录中")
    
    # 保存保留的图片列表
    keep_list_file = images_path.parent / "kept_images_list.txt"
    with open(keep_list_file, 'w', encoding='utf-8') as f:
        f.write("保留的图片列表：\n")
        for img in sorted(keep_images, key=lambda x: x.name):
            f.write(f"{img.name}\n")
    print(f"保留的图片列表已保存到：{keep_list_file}")

def main():
    # 记录开始时间
    start_time = time.time()
    start_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    
    print("=" * 60)
    print("图片随机选择与降采样脚本")
    print("=" * 60)
    print(f"开始时间: {start_time_str}")
    print("=" * 60)
    
    # 检查命令行参数
    if len(sys.argv) < 2:
        print("用法: python random_select_images.py <图片目录路径> [保留数量] [删除目录名] [最大尺寸]")
        print("示例: python random_select_images.py data/lidazhao/images 50 deleted 800")
        sys.exit(1)
    
    # 从命令行参数获取配置
    images_directory = sys.argv[1]
    keep_count = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    deleted_directory = sys.argv[3] if len(sys.argv) > 3 else "deleted"
    max_size = int(sys.argv[4]) if len(sys.argv) > 4 else None
    
    print(f"图片目录：{images_directory}")
    print(f"保留数量：{keep_count}")
    print(f"删除目录：{deleted_directory}")
    if max_size:
        print(f"最大尺寸：{max_size}")
    else:
        print("最大尺寸：不调整")
    print("=" * 60)
    
    # 执行选择操作
    random_select_images(images_directory, keep_count, deleted_directory)
    
    # 如果指定了最大尺寸，则对保留的图片进行降采样
    if max_size:
        print("\n" + "=" * 60)
        print("开始对保留的图片进行降采样...")
        print("=" * 60)
        resize_images(images_directory, max_size)
    
    # 记录结束时间并计算总运行时间
    end_time = time.time()
    end_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    duration = end_time - start_time
    
    # 格式化运行时间
    hours = int(duration // 3600)
    minutes = int((duration % 3600) // 60)
    seconds = int(duration % 60)
    
    print("\n" + "=" * 60)
    print("脚本执行完成！")
    print("=" * 60)
    print(f"开始时间: {start_time_str}")
    print(f"结束时间: {end_time_str}")
    print(f"总运行时间: {hours}小时 {minutes}分钟 {seconds}秒")
    print(f"总运行时间（秒）: {duration:.2f}秒")
    print("=" * 60)

if __name__ == "__main__":
    main() 