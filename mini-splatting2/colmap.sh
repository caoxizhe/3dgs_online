# The project folder must contain a folder "images" with all the images.
DATASET_PATH=/data0/sumai/mini-splatting2/data/lidazhao
COLMAP_PATH=/home/sumai/miniconda3/envs/Citygs_wzt/bin/colmap

# 记录开始时间
START_TIME=$(date +%s)
echo "开始执行COLMAP处理流程..."
echo "开始时间: $(date)"
echo "=================================="

$COLMAP_PATH feature_extractor \
   --database_path $DATASET_PATH/database.db \
   --image_path $DATASET_PATH/images

$COLMAP_PATH exhaustive_matcher \
   --database_path $DATASET_PATH/database.db

mkdir $DATASET_PATH/sparse

$COLMAP_PATH mapper \
    --database_path $DATASET_PATH/database.db \
    --image_path $DATASET_PATH/images \
    --output_path $DATASET_PATH/sparse

mkdir $DATASET_PATH/dense

$COLMAP_PATH image_undistorter \
    --image_path $DATASET_PATH/images \
    --input_path $DATASET_PATH/sparse/0 \
    --output_path $DATASET_PATH/dense \
    --output_type COLMAP \
    --max_image_size 2000

# $COLMAP_PATH patch_match_stereo \
#     --workspace_path $DATASET_PATH/dense \
#     --workspace_format COLMAP \
#     --PatchMatchStereo.geom_consistency true

# $COLMAP_PATH stereo_fusion \
#     --workspace_path $DATASET_PATH/dense \
#     --workspace_format COLMAP \
#     --input_type geometric \
#     --output_path $DATASET_PATH/dense/fused.ply

# $COLMAP_PATH poisson_mesher \
#     --input_path $DATASET_PATH/dense/fused.ply \
#     --output_path $DATASET_PATH/dense/meshed-poisson.ply

# $COLMAP_PATH delaunay_mesher \
#     --input_path $DATASET_PATH/dense \
#     --output_path $DATASET_PATH/dense/meshed-delaunay.ply

记录结束时间并计算总运行时间
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "=================================="
echo "COLMAP处理流程完成！"
echo "结束时间: $(date)"
echo "总运行时间: $((DURATION / 3600))小时 $(((DURATION % 3600) / 60))分钟 $((DURATION % 60))秒"
echo "总运行时间（秒）: ${DURATION}秒"