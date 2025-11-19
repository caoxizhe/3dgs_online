import { Events } from './events';

// 读取全局注入的 __GS_PRELOAD__ 并批量加载资源
export async function runPreload(events: Events) {
  const preload: any = (window as any).__GS_PRELOAD__;
  if (!preload) return;
  const tasks: Promise<any>[] = [];
  const { plyUrl, camerasUrl, imagesUrl } = preload;
  // 加载 PLY
  if (plyUrl) {
    tasks.push(events.invoke('import', plyUrl));
  }
  // 加载 cameras.json
  if (camerasUrl) {
    tasks.push(events.invoke('import', camerasUrl));
  }
  // 加载原始图片：如果提供目录路径，尝试枚举常见文件名（需后端静态暴露）
  if (imagesUrl) {
    // 简单探测前16张图片 (支持 jpg / png)，存在即导入 camera pose 辅助（若采用其它机制可在此扩展）
    const exts = ['.jpg', '.jpeg', '.png'];
    for (let i = 0; i < 16; i++) {
      for (const ext of exts) {
        const candidate = `${imagesUrl}/${i}${ext}`;
        tasks.push(fetch(candidate, { method: 'HEAD' }).then(r => {
          if (r.ok) {
            // 图片只用于在界面中可见，若需要贴图加载可在此扩展 texture 逻辑
            // 暂不直接调用 import（import 期望 ply / json），仅记录存在
            console.log('[preload image found]', candidate);
          }
        }).catch(() => {}));
      }
    }
  }
  await Promise.all(tasks);
  console.log('[preload done]');
}