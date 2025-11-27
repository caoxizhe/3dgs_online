rm ./data/lidazhao/* -rf
mkdir -p ./data/lidazhao/images
cp /data1/sumai/Data/Sofa_home/*JPG ./data/lidazhao/images/ -r
python random_select_images.py data/lidazhao/images 150 deleted 600 # 21s
bash ./colmap.sh  #10:31:18-10:31:32 75s
mkdir -p ./data/lidazhao/dense/sparse/0
cp data/lidazhao/dense/sparse/* data/lidazhao/dense/sparse/0/
python msv2/train.py -s ./data/lidazhao/dense/ -m outputs/lidazhao_Sofa_home --eval --imp_metric outdoor --config_path ./config/fast   # 112.103260s
