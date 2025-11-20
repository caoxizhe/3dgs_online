import { Vec3, EventHandle } from 'playcanvas';

import { CubicSpline } from './anim/spline';
import { Events } from './events';
import { Splat } from './splat';
import { ElementType } from './element';

type Pose = {
    name: string,
    frame: number,
    position: Vec3,
    target: Vec3
};

const registerCameraPosesEvents = (events: Events) => {
    // 前向模式开关：3DGS 原仓通常是 OpenCV 约定（+Z 前向），如需 OpenGL（-Z 前向）可改为 true
    const useOpenGLForward = false;

    // simplify keys toggle (default OFF)
    let simplifyKeys = false;
    events.function('camera.simplify.get', () => simplifyKeys);
    events.on('camera.simplify.set', (v: boolean) => { simplifyKeys = !!v; });

    // 提取旋转矩阵第三列（相机 Z 轴在世界坐标中的方向，若矩阵列向量描述相机坐标轴）
    const rotationCol3 = (rotation: any): Vec3 | null => {
        if (!rotation) return null;
        if (Array.isArray(rotation) && rotation.length === 3 && Array.isArray(rotation[0])) {
            return new Vec3(rotation[0][2], rotation[1][2], rotation[2][2]);
        }
        if (Array.isArray(rotation) && rotation.length === 9) {
            return new Vec3(rotation[2], rotation[5], rotation[8]);
        }
        return null;
    };

    // 从名称中提取末尾数字用于排序（比如 img_0012.png -> 12）。无数字则返回 Infinity。
    const extractIndex = (name: string): number => {
        if (!name) return Number.MAX_SAFE_INTEGER;
        const m = String(name).match(/(\d+)(?!.*\d)/);
        return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    };
    // ===== image overlay support (lazy create / destroy) =====
    let overlayEl: HTMLDivElement | null = null;
    let overlayScale = 1; // 保留容器自身缩放（仍可用按钮或后续扩展），但双击改为打开查看器

    const ensureOverlay = () => {
        if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
        const el = document.createElement('div');
        el.id = 'camera-image-overlay';
        el.style.position = 'fixed';
        el.style.top = '0';
        el.style.right = '0';
        el.style.width = 'auto';
        el.style.height = 'auto';
        el.style.zIndex = '1000';
        el.style.userSelect = 'none';
        el.style.touchAction = 'none';
        el.style.pointerEvents = 'auto';
        // 默认无平移
        el.style.transform = 'translate(0px, 0px) scale(1)';
        el.style.transformOrigin = 'top right';

        const setTransform = (tx: number, ty: number) => {
            el.style.transform = `translate(${tx}px, ${ty}px) scale(${overlayScale})`;
        };

    // 仅绑定一次拖拽
    if (!(el as any).dataset?.draggableApplied) {
            // 标记已绑定，注意不能整体替换 dataset（只读），应逐项赋值
            (el as any).dataset.draggableApplied = '1';
            let dragActive = false;
            let dragStartX = 0;
            let dragStartY = 0;
            let dragBaseX = 0;
            let dragBaseY = 0;
            const onPointerDown = (ev: PointerEvent) => {
                if (!ev.isPrimary || ev.button !== 0) return;
                dragActive = true;
                dragStartX = ev.clientX;
                dragStartY = ev.clientY;
                const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
                dragBaseX = m ? parseFloat(m[1]) : 0;
                dragBaseY = m ? parseFloat(m[2]) : 0;
                try { (el as any).setPointerCapture?.(ev.pointerId); } catch { /* noop */ }
            };
            const onPointerMove = (ev: PointerEvent) => {
                if (!dragActive) return;
                const dx = ev.clientX - dragStartX;
                const dy = ev.clientY - dragStartY;
                const x = dragBaseX + dx;
                const y = dragBaseY + dy;
                setTransform(x, y);
            };
            const onPointerUp = (ev: PointerEvent) => {
                if (!dragActive) return;
                dragActive = false;
                try { (el as any).releasePointerCapture?.(ev.pointerId); } catch { /* noop */ }
            };
            el.addEventListener('pointerdown', onPointerDown);
            el.addEventListener('pointermove', onPointerMove);
            el.addEventListener('pointerup', onPointerUp);

            // dblclick on container: open image viewer with current images
            el.addEventListener('dblclick', (ev) => {
                ev.stopPropagation();
                const imgs = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
                const urls = imgs.map(i => i.src).filter(Boolean);
                if (urls.length > 0) openImageViewer(urls, 0);
            });
        }

        document.body.appendChild(el);
        overlayEl = el;
        return overlayEl;
    };

    const destroyOverlay = () => {
        if (overlayEl && overlayEl.parentElement) {
            overlayEl.parentElement.removeChild(overlayEl);
        }
        overlayEl = null;
    };

    // independent caption box (always shown even without images), placed below Scene Manager panel
    let captionBox = document.getElementById('camera-caption-box') as HTMLDivElement | null;
    if (!captionBox) {
        captionBox = document.createElement('div');
        captionBox.id = 'camera-caption-box';
        captionBox.style.position = 'relative';
        captionBox.style.display = 'block';
        captionBox.style.width = '100%';
        captionBox.style.boxSizing = 'border-box';
        captionBox.style.margin = '6px auto';
        captionBox.style.textAlign = 'center';
        captionBox.style.pointerEvents = 'none';
        captionBox.style.background = 'rgba(0,0,0,0.95)';
        captionBox.style.borderRadius = '4px';
        captionBox.style.padding = '8px';
        captionBox.style.color = '#fff';
        captionBox.style.fontFamily = 'monospace';
        captionBox.style.fontSize = '12px';
        captionBox.style.lineHeight = '16px';
        captionBox.style.whiteSpace = 'pre-line';
        captionBox.textContent = '';
        const scenePanelEl = document.getElementById('scene-panel');
        if (scenePanelEl) {
            scenePanelEl.appendChild(captionBox);
        } else {
            document.body.appendChild(captionBox);
        }
    }

    const ensureCaptionPlacement = () => {
        if (!captionBox) return;
        const scenePanelEl = document.getElementById('scene-panel');
        if (scenePanelEl && captionBox.parentElement !== scenePanelEl) {
            scenePanelEl.appendChild(captionBox);
        }
    };

    // map frame -> HTMLImageElement[] (runtime images shown on overlay)
    const frameImageMap = new Map<number, HTMLImageElement[]>();
    // map frame -> expected image base name (captured when loading cameras)
    const frameImageNameMap = new Map<number, string>();
    // map frame -> camera id text for caption
    const frameCameraIdMap = new Map<number, string>();
    // map frame -> original camera position [x,y,z] from cameras.json (no coordinate flip)
    const frameRawPosMap = new Map<number, [number, number, number]>();
    // map frame -> original camera rotation 3x3 (flattened 9 numbers, row-major). null if unavailable
    const frameRawRotMap = new Map<number, number[] | null>();
    // map frame -> intrinsics (fx, fy)
    const frameFxMap = new Map<number, number>();
    const frameFyMap = new Map<number, number>();
    // cache: image name(lowercased, with/without ext) -> blob url
    const imageUrlByName = new Map<string, string>();

    // helpers for rotation transforms and intrinsics
    const toMat3 = (M: any): number[][] | null => {
        if (!M) return null;
        if (Array.isArray(M) && M.length === 3 && Array.isArray(M[0])) return M as number[][];
        if (Array.isArray(M) && M.length === 9) {
            return [
                [M[0], M[1], M[2]],
                [M[3], M[4], M[5]],
                [M[6], M[7], M[8]]
            ];
        }
        return null;
    };
    const convertRotationToPlayCanvas = (rot: any): number[][] | null => {
        const m = toMat3(rot);
        if (!m) return null;
        // cameras.json rotation 的列向量 = 相机坐标轴在世界系下的方向
        // supersplat/PlayCanvas 需要 (-x, -y, z) 轴翻转
        return [
            [-m[0][0], -m[0][1], -m[0][2]],
            [-m[1][0], -m[1][1], -m[1][2]],
            [ m[2][0],  m[2][1],  m[2][2]]
        ];
    };
    const flipXYRotation = convertRotationToPlayCanvas;
    const extractFxFyTop = (cam: any): { fx?: number, fy?: number } => {
        let fx: number | undefined;
        let fy: number | undefined;
        if (typeof cam?.fx === 'number') fx = cam.fx;
        if (typeof cam?.fy === 'number') fy = cam.fy;
        if ((!fx || !fy) && cam?.intrinsics) {
            if (typeof cam.intrinsics.fx === 'number') fx = cam.intrinsics.fx;
            if (typeof cam.intrinsics.fy === 'number') fy = cam.intrinsics.fy;
        }
        if ((!fx || !fy) && cam?.K) {
            const K = toMat3(cam.K);
            if (K) { fx = fx ?? K[0][0]; fy = fy ?? K[1][1]; }
        }
        return { fx, fy };
    };

    // quaternion helpers for rotation interpolation on SO(3)
    type QuatT = { x: number, y: number, z: number, w: number };
    const quatNormalize = (q: QuatT): QuatT => {
        const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
        return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
    };
    const quatFromMat3 = (m: number[][]): QuatT => {
        const m00 = m[0][0], m01 = m[0][1], m02 = m[0][2];
        const m10 = m[1][0], m11 = m[1][1], m12 = m[1][2];
        const m20 = m[2][0], m21 = m[2][1], m22 = m[2][2];
        const tr = m00 + m11 + m22;
        let x: number, y: number, z: number, w: number;
        if (tr > 0) {
            const s = Math.sqrt(tr + 1.0) * 2; // s=4*w
            w = 0.25 * s;
            x = (m21 - m12) / s;
            y = (m02 - m20) / s;
            z = (m10 - m01) / s;
        } else if (m00 > m11 && m00 > m22) {
            const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2; // s=4*x
            w = (m21 - m12) / s;
            x = 0.25 * s;
            y = (m01 + m10) / s;
            z = (m02 + m20) / s;
        } else if (m11 > m22) {
            const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2; // s=4*y
            w = (m02 - m20) / s;
            x = (m01 + m10) / s;
            y = 0.25 * s;
            z = (m12 + m21) / s;
        } else {
            const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2; // s=4*z
            w = (m10 - m01) / s;
            x = (m02 + m20) / s;
            y = (m12 + m21) / s;
            z = 0.25 * s;
        }
        return quatNormalize({ x, y, z, w });
    };
    const quatSlerp = (a: QuatT, b: QuatT, t: number): QuatT => {
        // ensure shortest path
        let ax = a.x, ay = a.y, az = a.z, aw = a.w;
        let bx = b.x, by = b.y, bz = b.z, bw = b.w;
        let cos = ax * bx + ay * by + az * bz + aw * bw;
        if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
        let k0: number, k1: number;
        if (1 - cos > 1e-6) {
            const theta = Math.acos(Math.max(-1, Math.min(1, cos)));
            const sin = Math.sin(theta);
            k0 = Math.sin((1 - t) * theta) / sin;
            k1 = Math.sin(t * theta) / sin;
        } else {
            k0 = 1 - t; k1 = t;
        }
        const out = { x: ax * k0 + bx * k1, y: ay * k0 + by * k1, z: az * k0 + bz * k1, w: aw * k0 + bw * k1 };
        return quatNormalize(out);
    };
    const mat3FromQuat = (q: QuatT): number[][] => {
        const x = q.x, y = q.y, z = q.z, w = q.w;
        const xx = x * x, yy = y * y, zz = z * z;
        const xy = x * y, xz = x * z, yz = y * z;
        const wx = w * x, wy = w * y, wz = w * z;
        return [
            [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
            [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
            [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)]
        ];
    };

    // helper: show images for a frame (hold last keyframe image until next one)
    const showImagesForFrame = (frame: number) => {
        // 找到要显示的帧（持有上一个关键帧）并取得该帧图片

        // 在重建或加载期间，若当前无任何图片，保留已有容器与内容（若存在），避免位置丢失
        if (frameImageMap.size === 0) {
            if (overlayEl && document.body.contains(overlayEl)) {
                return;
            }
        }
        // find the greatest frame key <= current frame
        let displayFrame: number | null = null;
        let sortedKeys: number[] = [];
        if (frameImageMap.size > 0) {
            sortedKeys = Array.from(frameImageMap.keys()).sort((a, b) => a - b);
            for (let i = 0; i < sortedKeys.length; i++) {
                if (sortedKeys[i] <= frame) displayFrame = sortedKeys[i];
                else break;
            }
        }

        // fallback: if before the first keyframe, show the first key's image
        if (displayFrame === null) {
            if (sortedKeys.length > 0) {
                displayFrame = sortedKeys[0];
            } else {
                // 无图且容器不存在：什么也不做；若容器已存在则保留
                if (!overlayEl) return;
                return;
            }
        }
        const imgs = frameImageMap.get(displayFrame);
        if (!imgs || imgs.length === 0) {
            // 无可显示图片：若已有容器则保留并不清空，避免闪烁；否则不创建
            if (!overlayEl) return;
            return;
        }

        const overlay = ensureOverlay();
        // 清空容器并重新填充
        while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

        // gather caption fields
        const idText = frameCameraIdMap.get(displayFrame) ?? '';
        const rawPos = frameRawPosMap.get(displayFrame);
        const rawRot = frameRawRotMap.get(displayFrame);
        const fmt3 = (a: number[]) => `[${a[0].toFixed(3)}, ${a[1].toFixed(3)}, ${a[2].toFixed(3)}]`;
        const rotText = rawRot && rawRot.length === 9
            ? `[[${rawRot[0].toFixed(3)}, ${rawRot[1].toFixed(3)}, ${rawRot[2].toFixed(3)}],\n [${rawRot[3].toFixed(3)}, ${rawRot[4].toFixed(3)}, ${rawRot[5].toFixed(3)}],\n [${rawRot[6].toFixed(3)}, ${rawRot[7].toFixed(3)}, ${rawRot[8].toFixed(3)}]]`
            : 'N/A';

        // layout images as thumbnails in top-right corner
        const padding = 8;
        const thumbW = 240;
        const thumbH = Math.round(thumbW * 0.75);
        const captionH = 44;
        imgs.forEach((img, i) => {
            const wrapper = document.createElement('div');
            wrapper.style.position = 'absolute';
            wrapper.style.top = `${padding + i * (thumbH + padding)}px`;
            // 右上角展示
            wrapper.style.right = `${padding}px`;
            wrapper.style.width = `${thumbW}px`;
            wrapper.style.height = `${thumbH + captionH}px`;
            wrapper.style.pointerEvents = 'auto';
            wrapper.style.background = 'rgba(0,0,0,0.95)';
            wrapper.style.padding = '4px';
            wrapper.style.boxSizing = 'border-box';
            wrapper.style.borderRadius = '4px';
            wrapper.style.cursor = 'zoom-in';

            const clone = img.cloneNode(true) as HTMLImageElement;
            clone.style.width = '100%';
            clone.style.height = `${thumbH}px`;
            clone.style.objectFit = 'cover';
            clone.style.pointerEvents = 'auto';

            wrapper.appendChild(clone);

            // caption text for camera info
            const cap = document.createElement('div');
            cap.style.width = '100%';
            cap.style.height = `${captionH}px`;
            cap.style.color = '#fff';
            cap.style.fontSize = '12px';
            cap.style.textAlign = 'center';
            cap.style.pointerEvents = 'none';
            cap.style.whiteSpace = 'pre-line';
            cap.style.background = 'rgba(0,0,0,0.95)';
            cap.style.borderRadius = '3px';
            cap.style.padding = '4px 6px';

            // Combine camera_id, img_name and raw position/rotation for display
            const imgName = frameImageNameMap.get(displayFrame) ?? 'unknown';
            const posText = rawPos ? fmt3(rawPos as any) : 'N/A';
            cap.textContent = `camera id: ${idText}\nimg name: ${imgName}\nposition: ${posText}\nrotation: ${rotText}`;

            wrapper.appendChild(cap);

            // dblclick 打开图片查看器，从当前图片开始
            wrapper.addEventListener('dblclick', (ev) => {
                ev.stopPropagation();
                const allImgs = imgs.map(im => im.src);
                openImageViewer(allImgs, i);
            });
            overlay.appendChild(wrapper);
        });
    };

    // ===== 图片查看器（内嵌 overlay） =====
    let viewerEl: HTMLDivElement | null = null;
    let viewerStageEl: HTMLDivElement | null = null;
    let viewerImgEl: HTMLImageElement | null = null;
    let viewerToolbarEl: HTMLDivElement | null = null;
    let viewerCloseBtn: HTMLButtonElement | null = null;
    let viewerPrevBtn: HTMLButtonElement | null = null;
    let viewerNextBtn: HTMLButtonElement | null = null;
    let viewerZoomInBtn: HTMLButtonElement | null = null;
    let viewerZoomOutBtn: HTMLButtonElement | null = null;
    let viewerFitBtn: HTMLButtonElement | null = null;
    let viewerOneBtn: HTMLButtonElement | null = null;

    let viewerImages: string[] = [];
    let viewerIndex = 0;
    let vScale = 1;
    let vMinScale = 0.1;
    let vMaxScale = 8;
    let vTx = 0, vTy = 0;
    let vDragging = false, vStartX = 0, vStartY = 0, vBaseX = 0, vBaseY = 0;

    const ensureImageViewer = () => {
        if (viewerEl && document.body.contains(viewerEl)) return viewerEl;
        const root = document.createElement('div');
        root.id = 'image-viewer-overlay';
        root.style.position = 'fixed';
        root.style.left = '0';
        root.style.top = '0';
        root.style.width = '100%';
        root.style.height = '100%';
        root.style.background = 'rgba(0,0,0,0.85)';
        root.style.zIndex = '3000';
        root.style.display = 'none';
        root.style.userSelect = 'none';
        root.style.touchAction = 'none';

        // close button (top-right)
        const closeBtn = document.createElement('button');
        closeBtn.title = '关闭';
        closeBtn.textContent = '×';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '10px';
        closeBtn.style.right = '12px';
        closeBtn.style.width = '36px';
        closeBtn.style.height = '36px';
        closeBtn.style.border = 'none';
        closeBtn.style.borderRadius = '18px';
        closeBtn.style.background = 'rgba(0,0,0,0.6)';
        closeBtn.style.color = '#fff';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.lineHeight = '36px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.zIndex = '1';
        root.appendChild(closeBtn);

        // stage area
        const stage = document.createElement('div');
        stage.style.position = 'absolute';
        stage.style.left = '0';
        stage.style.top = '0';
        stage.style.right = '0';
        stage.style.bottom = '0';
        stage.style.overflow = 'hidden';
        stage.style.cursor = 'grab';
        root.appendChild(stage);

        const img = document.createElement('img');
        img.style.position = 'absolute';
        img.style.left = '0';
        img.style.top = '0';
        img.style.willChange = 'transform';
        img.style.transformOrigin = '0 0';
        stage.appendChild(img);

        // toolbar
        const toolbar = document.createElement('div');
        toolbar.style.position = 'absolute';
        toolbar.style.left = '50%';
        toolbar.style.transform = 'translateX(-50%)';
        toolbar.style.bottom = '16px';
        toolbar.style.background = 'rgba(0,0,0,0.5)';
        toolbar.style.padding = '6px 10px';
        toolbar.style.borderRadius = '6px';
        toolbar.style.display = 'flex';
        toolbar.style.gap = '8px';

        const mkBtn = (label: string, title: string) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.title = title;
            b.style.color = '#fff';
            b.style.background = 'rgba(255,255,255,0.1)';
            b.style.border = '1px solid rgba(255,255,255,0.2)';
            b.style.borderRadius = '4px';
            b.style.padding = '4px 8px';
            b.style.cursor = 'pointer';
            return b;
        };
        const btnZoomOut = mkBtn('−', '缩小');
        const btnZoomIn = mkBtn('+', '放大');
        const btnOne = mkBtn('1:1', '实际像素');
        const btnFit = mkBtn('适配', '适配窗口');
        const btnPrev = mkBtn('◀', '上一张');
        const btnNext = mkBtn('▶', '下一张');
        toolbar.append(btnZoomOut, btnZoomIn, btnOne, btnFit, btnPrev, btnNext);
        root.appendChild(toolbar);

        document.body.appendChild(root);

        // wire refs
        viewerEl = root; viewerStageEl = stage; viewerImgEl = img; viewerToolbarEl = toolbar;
        viewerCloseBtn = closeBtn; viewerZoomInBtn = btnZoomIn; viewerZoomOutBtn = btnZoomOut;
        viewerFitBtn = btnFit; viewerOneBtn = btnOne; viewerPrevBtn = btnPrev; viewerNextBtn = btnNext;

        // interactions
        const applyTransform = () => {
            if (!viewerImgEl) return;
            viewerImgEl.style.transform = `translate(${vTx}px, ${vTy}px) scale(${vScale})`;
        };
        const computeFit = () => {
            if (!viewerStageEl || !viewerImgEl) return 1;
            const sw = viewerStageEl.clientWidth;
            const sh = viewerStageEl.clientHeight;
            const iw = (viewerImgEl.naturalWidth || viewerImgEl.width) || 1;
            const ih = (viewerImgEl.naturalHeight || viewerImgEl.height) || 1;
            const s = Math.min(sw / iw, sh / ih) * 0.98;
            return Math.max(0.05, Math.min(8, s));
        };
        const centerImage = () => {
            if (!viewerStageEl || !viewerImgEl) return;
            const sw = viewerStageEl.clientWidth;
            const sh = viewerStageEl.clientHeight;
            const iw = (viewerImgEl.naturalWidth || viewerImgEl.width) || 1;
            const ih = (viewerImgEl.naturalHeight || viewerImgEl.height) || 1;
            vTx = Math.round((sw - iw * vScale) / 2);
            vTy = Math.round((sh - ih * vScale) / 2);
            applyTransform();
        };
        const setScale = (s: number) => {
            vScale = Math.max(vMinScale, Math.min(vMaxScale, s));
            applyTransform();
        };
        const wheelZoom = (e: WheelEvent) => {
            if (!viewerStageEl || !viewerImgEl) return;
            e.preventDefault();
            const rect = viewerStageEl.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            const prev = vScale;
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const next = Math.max(vMinScale, Math.min(vMaxScale, vScale * factor));
            if (next === prev) return;
            // pivot at cursor
            const mx = (cx - vTx) / prev;
            const my = (cy - vTy) / prev;
            vTx = cx - mx * next;
            vTy = cy - my * next;
            vScale = next;
            applyTransform();
        };
        const setImage = (index: number) => {
            if (!viewerImgEl) return;
            viewerIndex = Math.max(0, Math.min(viewerImages.length - 1, index));
            const url = viewerImages[viewerIndex];
            viewerImgEl.src = url;
            viewerImgEl.onload = () => {
                vMinScale = computeFit();
                setScale(vMinScale);
                centerImage();
            };
        };

        // pointer pan
        stage.addEventListener('pointerdown', (ev) => {
            if (ev.button !== 0) return;
            vDragging = true; vStartX = ev.clientX; vStartY = ev.clientY; vBaseX = vTx; vBaseY = vTy;
            stage.setPointerCapture?.(ev.pointerId);
            stage.style.cursor = 'grabbing';
        });
        stage.addEventListener('pointermove', (ev) => {
            if (!vDragging) return;
            vTx = vBaseX + (ev.clientX - vStartX);
            vTy = vBaseY + (ev.clientY - vStartY);
            applyTransform();
        });
        stage.addEventListener('pointerup', (ev) => {
            if (!vDragging) return;
            vDragging = false; stage.releasePointerCapture?.(ev.pointerId);
            stage.style.cursor = 'grab';
        });
        stage.addEventListener('wheel', wheelZoom, { passive: false });
        stage.addEventListener('dblclick', (ev) => {
            // toggle 1:1 / fit
            vScale = Math.abs(vScale - 1) < 1e-3 ? vMinScale : 1;
            centerImage();
            ev.stopPropagation();
        });

        // toolbar actions
        btnZoomIn.addEventListener('click', () => { setScale(vScale * 1.2); });
        btnZoomOut.addEventListener('click', () => { setScale(vScale / 1.2); });
        btnOne.addEventListener('click', () => { setScale(1); centerImage(); });
        btnFit.addEventListener('click', () => { vMinScale = computeFit(); setScale(vMinScale); centerImage(); });
        btnPrev.addEventListener('click', () => { if (viewerImages.length) setImage((viewerIndex - 1 + viewerImages.length) % viewerImages.length); });
        btnNext.addEventListener('click', () => { if (viewerImages.length) setImage((viewerIndex + 1) % viewerImages.length); });
        closeBtn.addEventListener('click', () => { closeImageViewer(); });

        // expose helpers on root for reuse
        (root as any)._setImage = setImage;
        (root as any)._centerImage = centerImage;
        (root as any)._computeFit = computeFit;

        return viewerEl;
    };

    const openImageViewer = (urls: string[], startIndex = 0) => {
        ensureImageViewer();
        if (!viewerEl) return;
        viewerImages = urls.slice();
        viewerIndex = Math.max(0, Math.min(urls.length - 1, startIndex));
        viewerEl.style.display = 'block';
        // load image
        (viewerEl as any)._setImage(viewerIndex);
        // close on Esc
        const onKey = (e: KeyboardEvent) => {
            if (!viewerEl || viewerEl.style.display === 'none') return;
            if (e.key === 'Escape') { closeImageViewer(); }
            if (e.key === 'ArrowLeft') { viewerPrevBtn?.click(); }
            if (e.key === 'ArrowRight') { viewerNextBtn?.click(); }
            if (e.key === '+') { viewerZoomInBtn?.click(); }
            if (e.key === '-') { viewerZoomOutBtn?.click(); }
        };
        window.addEventListener('keydown', onKey);
        (viewerEl as any)._onKey = onKey;
    };

    const closeImageViewer = () => {
        if (!viewerEl) return;
        viewerEl.style.display = 'none';
        if ((viewerEl as any)._onKey) window.removeEventListener('keydown', (viewerEl as any)._onKey);
    };



    // 每个splat都有自己的poses数组
    const splatPoses = new Map<Splat, Pose[]>();
    // 最近一次加载的原始相机数据缓存（用于 SIM 切换时重建）
    let lastLoadedCameras: any[] | null = null;
    let lastLoadedSplat: Splat | null = null;

    let onTimelineChange: (frame: number) => void;
    // 跳转过程标记：避免 timeline 的 onTimelineChange 在跳转动画期间覆盖自定义插值的方向，造成画面与轴突变
    let jumpInProgress = false;
    let lastPoseForCaption: { position: Vec3, target: Vec3 } | null = null;
    let lastRotationForCaption: number[][] | null = null;

    // 获取当前选中splat的poses
    const getCurrentSplatPoses = (): Pose[] => {
        const selectedSplat = events.invoke('selection') as Splat;
        if (!selectedSplat) {
            return [];
        }
        
        if (!splatPoses.has(selectedSplat)) {
            splatPoses.set(selectedSplat, []);
        }
        
        return splatPoses.get(selectedSplat)!;
    };

    const rebuildSpline = () => {
        const duration = events.invoke('timeline.frames');
        const poses = getCurrentSplatPoses();

        const orderedPoses = poses.slice()
        // filter out keys beyond the end of the timeline
        .filter(a => a.frame < duration)
        // order keys by time for spline
        .sort((a, b) => a.frame - b.frame);

        // construct the spline points to be interpolated
        const times = orderedPoses.map(p => p.frame);
        const points = [];
        for (let i = 0; i < orderedPoses.length; ++i) {
            const p = orderedPoses[i];
            points.push(p.position.x, p.position.y, p.position.z);
            points.push(p.target.x, p.target.y, p.target.z);
        }

        if (orderedPoses.length > 1) {
            // interpolate camera positions and camera target positions
            const spline = CubicSpline.fromPointsLooping(duration, times, points, -1);
            const result: number[] = [];
            const pose = { position: new Vec3(), target: new Vec3() };

            // handle application update tick
            onTimelineChange = (frame: number) => {
                const time = frame;

                // evaluate the spline at current time
                spline.evaluate(time, result);

                // set camera pose
                pose.position.set(result[0], result[1], result[2]);
                pose.target.set(result[3], result[4], result[5]);
                // record for realtime caption
                lastPoseForCaption = { position: pose.position.clone(), target: pose.target.clone() };
                // interpolate rotation on SO(3) between surrounding keyframes and linearly interpolate fx/fy
                let i0 = 0;
                while (i0 + 1 < orderedPoses.length && orderedPoses[i0 + 1].frame <= time) i0++;
                const i1 = Math.min(i0 + 1, orderedPoses.length - 1);
                const f0 = orderedPoses[i0]?.frame ?? time;
                const f1 = orderedPoses[i1]?.frame ?? time;
                const denom = Math.max(1, f1 - f0);
                const t = Math.max(0, Math.min(1, (time - f0) / denom));

                const raw0 = frameRawRotMap.get(f0);
                const raw1 = frameRawRotMap.get(f1);
                const m0 = raw0 ? flipXYRotation(raw0) : null;
                const m1 = raw1 ? flipXYRotation(raw1) : null;
                const haveBoth = !!(m0 && m1);

                // Interpolate in fov domain (radians). Use aspect to derive missing axis.
                let fx: number | undefined = undefined;
                let fy: number | undefined = undefined;
                const ts = (events.invoke('targetSize') || { width: 1, height: 1 }) as { width: number, height: number };
                const width = Math.max(1, ts.width|0);
                const height = Math.max(1, ts.height|0);
                const aspect = width / height;
                const fx0 = frameFxMap.get(f0); const fx1 = frameFxMap.get(f1);
                const fy0 = frameFyMap.get(f0); const fy1 = frameFyMap.get(f1);
                const fovPair = (fxv?: number, fyv?: number) => {
                    let fovX: number | undefined;
                    let fovY: number | undefined;
                    if (Number.isFinite(fxv as number)) {
                        fovX = 2 * Math.atan(width / (2 * (fxv as number)));
                        // derive Y from X if needed
                        if (!Number.isFinite(fyv as number)) {
                            fovY = 2 * Math.atan(Math.tan((fovX as number) / 2) / aspect);
                        }
                    }
                    if (Number.isFinite(fyv as number)) {
                        fovY = 2 * Math.atan(height / (2 * (fyv as number)));
                        if (!Number.isFinite(fovX as number)) {
                            fovX = 2 * Math.atan(Math.tan((fovY as number) / 2) * aspect);
                        }
                    }
                    return { fovX, fovY };
                };
                const p0 = fovPair(fx0, fy0);
                const p1 = fovPair(fx1, fy1);
                const lerp = (a?: number, b?: number) => (Number.isFinite(a as number) && Number.isFinite(b as number)) ? (a as number) * (1 - t) + (b as number) * t : (Number.isFinite(a as number) ? a : (Number.isFinite(b as number) ? b : undefined));
                const fovX = lerp(p0.fovX, p1.fovX);
                const fovY = lerp(p0.fovY, p1.fovY);
                if (Number.isFinite(fovX as number)) fx = width / (2 * Math.tan((fovX as number) / 2));
                if (Number.isFinite(fovY as number)) fy = height / (2 * Math.tan((fovY as number) / 2));

                if (jumpInProgress) {
                    // 跳转动画中：仅记录插值结果用于 caption，不改相机，避免方向被覆盖
                    if (m0 && m1) {
                        const q0 = quatFromMat3(m0);
                        const q1 = quatFromMat3(m1);
                        const qi = quatSlerp(q0, q1, t);
                        const mi = mat3FromQuat(qi);
                        lastRotationForCaption = mi.map(row => row.slice());
                    } else if (m0 || m1) {
                        lastRotationForCaption = (m0 ?? m1)?.map(row => row.slice()) ?? null;
                    } else {
                        lastRotationForCaption = null;
                    }
                } else if (haveBoth) {
                    const q0 = quatFromMat3(m0!);
                    const q1 = quatFromMat3(m1!);
                    const qi = quatSlerp(q0, q1, t);
                    const mi = mat3FromQuat(qi);
                    events.fire('camera.setView', {
                        position: pose.position,
                        target: pose.target,
                        rotation: mi,
                        fx,
                        fy,
                        speed: 0
                    });
                    lastRotationForCaption = mi.map(row => row.slice());
                } else if (m0 || m1) {
                    const mi = m0 ?? m1;
                    events.fire('camera.setView', {
                        position: pose.position,
                        target: pose.target,
                        rotation: mi,
                        fx,
                        fy,
                        speed: 0
                    });
                    lastRotationForCaption = mi?.map(row => row.slice()) ?? null;
                } else {
                    events.fire('camera.setPose', pose, 0);
                    lastRotationForCaption = null;
                }
            };
        } else {
            onTimelineChange = null;
        }
    };

    events.on('timeline.time', (time: number) => {
        onTimelineChange?.(time);
    });

    events.on('timeline.frame', (frame: number) => {
        onTimelineChange?.(frame);
    });

    // show overlay images when timeline frame changes
    events.on('timeline.frame', (frame: number) => {
        showImagesForFrame(frame);
    });

    // update independent caption: show position and live x/y/z axes from current camera rotation
    const updateCaptionForFrame = (_frame: number) => {
        ensureCaptionPlacement();
        if (!captionBox) return;
        const fmt = (v: Vec3) => `[${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}]`;
        // prefer current camera entity pose for realtime accuracy
        const cameraEntity = events.invoke('camera.entity');
        let pos: Vec3 | null = null;
        if (cameraEntity && typeof cameraEntity.getPosition === 'function') {
            const p = cameraEntity.getPosition();
            if (p) pos = new Vec3(p.x, p.y, p.z);
        }
        // fallback to pose.position if entity position not available
        if (!pos) {
            const pose = events.invoke('camera.getPose');
            if (pose?.position) pos = new Vec3(pose.position.x, pose.position.y, pose.position.z);
        }

        // derive axes from current quaternion every frame (works in free/orbit)
        let basis: number[][] | null = null;
        if (cameraEntity && typeof cameraEntity.getRotation === 'function') {
            const q = cameraEntity.getRotation?.();
            if (q) basis = mat3FromQuat({ x: q.x, y: q.y, z: q.z, w: q.w });
        }

        if (pos && basis) {
            const xAxis = new Vec3(basis[0][0], basis[1][0], basis[2][0]);
            const yAxis = new Vec3(basis[0][1], basis[1][1], basis[2][1]);
            const zAxis = new Vec3(basis[0][2], basis[1][2], basis[2][2]);
            captionBox.textContent = `position: ${fmt(pos)}\nx axis: ${fmt(xAxis)}\ny axis: ${fmt(yAxis)}\nz axis: ${fmt(zAxis)}`;
        }
    };

    events.on('timeline.frame', (frame: number) => {
        updateCaptionForFrame(frame);
    });

    // initialize caption immediately on scene load
    updateCaptionForFrame(0);

    // also update on each render to reflect user moving/rotating the camera
    events.on('prerender', () => updateCaptionForFrame(0));

    const addPose = (pose: Pose) => {
        const selectedSplat = events.invoke('selection') as Splat;
        if (!selectedSplat || pose.frame === undefined) {
            return false;
        }

        if (!splatPoses.has(selectedSplat)) {
            splatPoses.set(selectedSplat, []);
        }

        const poses = splatPoses.get(selectedSplat)!;

        // if a pose already exists at this time, update it
        const idx = poses.findIndex(p => p.frame === pose.frame);
        if (idx !== -1) {
            poses[idx] = pose;
        } else {
            poses.push(pose);
            events.fire('timeline.addKey', pose.frame);
        }

        rebuildSpline();
    };

    const removePose = (index: number) => {
        const selectedSplat = events.invoke('selection') as Splat;
        if (!selectedSplat) {
            return;
        }

        const poses = splatPoses.get(selectedSplat);
        if (poses && index >= 0 && index < poses.length) {
            poses.splice(index, 1);

            // remove the timeline key
            rebuildSpline();
            events.fire('timeline.removeKey', index);
        }
    };

    events.function('camera.poses', () => {
        return getCurrentSplatPoses();
    });

    events.on('camera.addPose', (pose: Pose) => {
        addPose(pose);
    });

    events.on('timeline.add', (frame: number) => {
        // get the current camera pose
        const pose = events.invoke('camera.getPose');
        // also capture current rotation as a RAW-style 3x3 so that rotation interpolation works between keys
        try {
            const camEnt = events.invoke('camera.entity');
            if (camEnt && typeof camEnt.getRotation === 'function') {
                const q = camEnt.getRotation();
                if (q) {
                    // engine quat -> engine basis B (entity.forward = -Z)
                    const B = mat3FromQuat({ x: q.x, y: q.y, z: q.z, w: q.w });
                    // convert to pre-flip basis expected by setView pipeline: Mpre = [B0, -B1, -B2]
                    const Mpre = [
                        [ B[0][0], -B[0][1], -B[0][2] ],
                        [ B[1][0], -B[1][1], -B[1][2] ],
                        [ B[2][0], -B[2][1], -B[2][2] ]
                    ];
                    // store RAW-like matrix so later flipXYRotation(raw) == Mpre
                    const Raw = flipXYRotation(Mpre);
                    if (Raw) {
                        const flat = [
                            Raw[0][0], Raw[0][1], Raw[0][2],
                            Raw[1][0], Raw[1][1], Raw[1][2],
                            Raw[2][0], Raw[2][1], Raw[2][2]
                        ];
                        frameRawRotMap.set(frame, flat);
                    }
                }
            }
        } catch { /* noop */ }
        const poses = getCurrentSplatPoses();

        addPose({
            name: `camera_${poses.length}`,
            frame,
            position: pose.position,
            target: pose.target
        });
    });

    events.on('timeline.remove', (index: number) => {
        removePose(index);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
    });

    // 基于缓存数据重建关键帧（用于 SIM 开关即时生效）
    const rebuildFromCache = () => {
        const selectedSplat = lastLoadedSplat ?? (events.invoke('selection') as Splat);
        if (!lastLoadedCameras || !selectedSplat) return;

        // 复制 camera.loadKeys 中的选取、时间轴与帧分配逻辑
        let cameras: any[] = lastLoadedCameras.slice();

        // 排序（按名称数字）
        const extract = (name: string) => {
            if (!name) return Number.MAX_SAFE_INTEGER;
            const m = String(name).match(/(\d+)(?!.*\d)/);
            return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
        };
        const withNumeric = cameras.filter(c => Number.isFinite(extract(c?.img_name || c?.name)) && extract(c?.img_name || c?.name) !== Number.MAX_SAFE_INTEGER);
        if (withNumeric.length > 0) {
            cameras = cameras.slice().sort((a, b) => extract(a?.img_name || a?.name) - extract(b?.img_name || b?.name));
        }

        // 选择集合（受 simplify 开关影响）
        const totalCameras = cameras.length;
        const maxCameras = 10;
        let selectedCameras: any[] = [];
        if (!events.invoke('camera.simplify.get')) {
            selectedCameras = cameras;
        } else if (totalCameras <= maxCameras) {
            selectedCameras = cameras;
        } else {
            const indices: number[] = [];
            for (let i = 0; i < maxCameras; i++) {
                const index = Math.round(i * (totalCameras - 1) / (maxCameras - 1));
                if (!indices.includes(index)) indices.push(index);
            }
            selectedCameras = indices.map(i => cameras[i]);
        }

        // 场景中心（全部相机）
        const sceneCenter = new Vec3(0, 0, 0);
        let validCount = 0;
        cameras.forEach(c => {
            if (c.position && Array.isArray(c.position)) { sceneCenter.add(new Vec3(c.position)); validCount++; }
        });
        if (validCount > 0) sceneCenter.mulScalar(1 / validCount);

        // 平均距离（基于所选集合）
        let averageDistance = 0;
        if (selectedCameras.length > 0) {
            selectedCameras.forEach(c => {
                if (c.position && Array.isArray(c.position)) averageDistance += new Vec3(c.position).distance(sceneCenter);
            });
            averageDistance /= Math.max(1, selectedCameras.length);
            averageDistance = Math.max(averageDistance * 0.5, 1.0);
        } else {
            averageDistance = 5.0;
        }

        // 时间轴自适应：相邻至少 18 帧
        const minGap = 18;
        const n = Math.max(1, selectedCameras.length);
        const desiredSteps = Math.max(1, n - 1);
        const baseFrames = Math.max(1, events.invoke('timeline.frames') || 1200);
        const step = (n > 1) ? Math.max(minGap, Math.ceil((baseFrames - 1) / desiredSteps)) : 1;
        const finalFrames = (n > 1) ? (step * desiredSteps + 1) : baseFrames;
        events.fire('timeline.setFrames', finalFrames);
        const frameForIndex = (i: number) => (n > 1) ? (i * step) : 0;

        // 清空并重建映射
        const newPoses: Pose[] = [];
        frameImageNameMap.clear();
        frameCameraIdMap.clear();
        frameRawPosMap.clear();
        frameRawRotMap.clear();
        frameFxMap.clear();
        frameFyMap.clear();
        frameRawPosMap.clear();
        frameRawRotMap.clear();

        // rotation 第三行（相机前向）提取函数已在之前定义：rotationCol3
        selectedCameras.forEach((cameraData: any, index: number) => {
            const position = new Vec3(cameraData.position);
            let outPosition = new Vec3(cameraData.position);
            let outTarget: Vec3;
            if (cameraData.target && Array.isArray(cameraData.target)) {
                outTarget = new Vec3(cameraData.target);
            } else if (cameraData.rotation) {
                const z = rotationCol3(cameraData.rotation);
                if (z) {
                    const toCenter = sceneCenter.clone().sub(position);
                    const dot = toCenter.dot(z);
                    const targetFromRot = position.clone().add(z.clone().mulScalar(dot));
                    outPosition = new Vec3(-position.x, -position.y, position.z);
                    outTarget = new Vec3(-targetFromRot.x, -targetFromRot.y, targetFromRot.z);
                } else {
                    outTarget = sceneCenter.clone();
                }
            } else {
                outTarget = sceneCenter.clone();
            }

            const frame = frameForIndex(index);
            const imageName = cameraData.img_name || cameraData.name;
            if (imageName) frameImageNameMap.set(frame, String(imageName));
            const idText = Number.isFinite(cameraData.id) ? String(cameraData.id) : (cameraData.name ?? imageName ?? `#${index}`);
            frameCameraIdMap.set(frame, idText);
            // store raw position/rotation (no coordinate flip)
            if (cameraData.position && Array.isArray(cameraData.position) && cameraData.position.length === 3) {
                frameRawPosMap.set(frame, [cameraData.position[0], cameraData.position[1], cameraData.position[2]]);
            }
            if (cameraData.rotation) {
                let rot: number[] | null = null;
                if (Array.isArray(cameraData.rotation) && cameraData.rotation.length === 3 && Array.isArray(cameraData.rotation[0])) {
                    rot = [
                        cameraData.rotation[0][0], cameraData.rotation[0][1], cameraData.rotation[0][2],
                        cameraData.rotation[1][0], cameraData.rotation[1][1], cameraData.rotation[1][2],
                        cameraData.rotation[2][0], cameraData.rotation[2][1], cameraData.rotation[2][2]
                    ];
                } else if (Array.isArray(cameraData.rotation) && cameraData.rotation.length === 9) {
                    rot = cameraData.rotation.slice(0, 9);
                }
                frameRawRotMap.set(frame, rot);
            } else {
                frameRawRotMap.set(frame, null);
            }

            // 记录 fx/fy
            const intr = extractFxFyTop(cameraData);
            if (Number.isFinite(intr.fx)) frameFxMap.set(frame, intr.fx as number);
            if (Number.isFinite(intr.fy)) frameFyMap.set(frame, intr.fy as number);

            newPoses.push({
                name: cameraData.name || cameraData.img_name || `camera_${index}`,
                frame,
                position: outPosition,
                target: outTarget
            });
        });

        splatPoses.set(selectedSplat, newPoses);
        rebuildSpline();
        const framesForTimeline = newPoses.map(p => p.frame);
        events.fire('timeline.setSplatKeys', selectedSplat, framesForTimeline);
        events.fire('timeline.selectionChanged');
        // 根据当前所选关键帧裁剪或重建图片映射（确保 SIM 开启时仅显示 10 张）
        const allowedFrames = new Set(framesForTimeline);
        rebuildFrameImagesFromNames(allowedFrames);
        // 更新右上角缩略（若无图则自动销毁容器）
        const curFrame = events.invoke('timeline.frame');
        showImagesForFrame(curFrame);
    };

    // 简化开关变更时，立即重建
    events.on('camera.simplify.set', () => {
        rebuildFromCache();
    });

    // 当选择变化时，重建spline以适应新选中splat的poses
    events.on('selection.changed', () => {
        rebuildSpline();
        // clear overlay images and planned name mapping for new selection
        frameImageMap.clear();
        frameImageNameMap.clear();
        frameCameraIdMap.clear();
        frameFxMap.clear();
        frameFyMap.clear();
        if (captionBox) captionBox.textContent = '';
        destroyOverlay();

        // 若有进行中的就近跳转动画，切换选中时终止
        if (jumpAnimHandle) {
            jumpAnimHandle.off();
            jumpAnimHandle = null;
        }
    });

    // 当splat被移除时，清理其poses数据
    events.on('scene.elementRemoved', (element: any) => {
        if (element.type === ElementType.splat) {
            splatPoses.delete(element as Splat);
            // 若场景中已无 splat，移除图片容器
            const allSplats = (events.invoke('scene.allSplats') as Splat[]) || [];
            if (!allSplats || allSplats.length === 0) {
                frameImageMap.clear();
                frameImageNameMap.clear();
                frameCameraIdMap.clear();
                frameRawPosMap.clear();
                frameRawRotMap.clear();
                frameFxMap.clear();
                frameFyMap.clear();
                destroyOverlay();
            }
        }
    });

    // 保存当前选中splat的关键帧到JSON文件
    events.on('camera.saveKeys', () => {
        const selectedSplat = events.invoke('selection') as Splat;
        if (!selectedSplat) {
            events.invoke('showPopup', {
                type: 'error',
                header: '保存失败',
                message: '请先选择一个Splat对象'
            });
            return;
        }

        const poses = getCurrentSplatPoses();
        if (poses.length === 0) {
            events.invoke('showPopup', {
                type: 'error',
                header: '保存失败',
                message: '当前选中的Splat没有关键帧数据'
            });
            return;
        }
        // 导出需求：不再包含 target；输出原始 3dgs 坐标系下的 position、rotation(3x3)、fx、fy。
        // 我们在加载时对 position 做了 (-x,-y,z) 翻转，这里需翻回；rotation 原始矩阵已缓存在 frameRawRotMap。
        const to3dgsPos = (frame: number, edited: Vec3): [number, number, number] => {
            const raw = frameRawPosMap.get(frame);
            if (raw && raw.length === 3) return [raw[0], raw[1], raw[2]];
            // 若无原始缓存，按加载时的转换逆操作：当前 pose.position 是已翻转后的 (-x,-y,z)
            return [-edited.x, -edited.y, edited.z];
        };
        const to3dgsRot = (frame: number): number[][] | null => {
            const raw = frameRawRotMap.get(frame);
            if (!raw) return null;
            if (raw.length === 9) {
                return [
                    [raw[0], raw[1], raw[2]],
                    [raw[3], raw[4], raw[5]],
                    [raw[6], raw[7], raw[8]]
                ];
            }
            // 已是 3x3 嵌套时（不太可能，因为存的是扁平），直接返回
            return null;
        };
        const data = {
            version: 2,
            splatName: selectedSplat.name,
            frameCount: events.invoke('timeline.frames'),
            frameRate: events.invoke('timeline.frameRate'),
            timestamp: new Date().toISOString(),
            poses: poses.map((pose) => {
                const position = to3dgsPos(pose.frame, pose.position);
                const rotation = to3dgsRot(pose.frame); // 原始 cameras.json 旋转（列向量表示相机坐标轴）
                const fx = frameFxMap.get(pose.frame);
                const fy = frameFyMap.get(pose.frame);
                return {
                    name: pose.name,
                    frame: pose.frame,
                    position,
                    rotation: rotation ?? undefined,
                    fx: Number.isFinite(fx) ? fx : undefined,
                    fy: Number.isFinite(fy) ? fy : undefined
                };
            })
        };

        // 创建并下载JSON文件
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedSplat.name}_keyframes.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 显示成功消息
        events.invoke('showPopup', {
            type: 'info',
            header: '保存成功',
            message: `已保存 ${selectedSplat.name} 的 ${poses.length} 个关键帧 (version=2, 含原始 rotation / fx / fy)\n文件名: ${selectedSplat.name}_keyframes.json\n\n建议将文件保存到项目的 keyframes/ 目录下`
        });
    });

    // 加载关键帧文件
    events.on('camera.loadKeys', () => {
        const selectedSplat = events.invoke('selection') as Splat;
        if (!selectedSplat) {
            events.invoke('showPopup', {
                type: 'error',
                header: '加载失败',
                message: '请先选择一个Splat对象'
            });
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';

        input.onchange = (event: Event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const result = e.target?.result as string;
                    const data = JSON.parse(result);

                    // 支持两种格式：新的相机数组格式和原有的poses格式
                    let cameras: any[] = [];

                    if (Array.isArray(data)) {
                        // 格式1: 直接是相机数组，适用于原始3dgs导出的cameras.json格式
                        cameras = data;
                    } else if (data.poses && Array.isArray(data.poses)) {
                        // 格式2: 原有的poses格式
                        cameras = data.poses;
                    } else {
                        events.invoke('showPopup', {
                            type: 'error',
                            header: '加载失败',
                            message: '不支持的文件格式：应该是相机数组或poses数组'
                        });
                        return;
                    }

                    // 验证相机数据格式
                    for (const camera of cameras) {
                        if (!camera.position || !Array.isArray(camera.position) || camera.position.length !== 3) {
                            events.invoke('showPopup', {
                                type: 'error',
                                header: '加载失败',
                                message: '相机数据格式错误：position字段应为3元素数组'
                            });
                            return;
                        }

                        // 检查是否有rotation或target信息
                        if (!camera.rotation && !camera.target) {
                            events.invoke('showPopup', {
                                type: 'warning',
                                header: '注意',
                                message: '相机数据缺少rotation或者是target信息，将使用默认朝向'
                            });
                        }
                    }

                    // 始终按图片名称中的数字升序排序；无数字的放在末尾
                    const withNumeric = cameras.filter(c => Number.isFinite(extractIndex(c?.img_name || c?.name)) && extractIndex(c?.img_name || c?.name) !== Number.MAX_SAFE_INTEGER);
                    if (withNumeric.length > 0) {
                        cameras = cameras.slice().sort((a, b) => {
                            const ia = extractIndex(a?.img_name || a?.name);
                            const ib = extractIndex(b?.img_name || b?.name);
                            return ia - ib;
                        });
                    }

                    // 智能选取相机视角，确保平滑过渡
                    const totalCameras = cameras.length;
                    const maxCameras = 10; // 最多选择10个相机
                    
                    let selectedCameras: any[] = [];
                    
                    if (!events.invoke('camera.simplify.get')) {
                        // 默认：不开简化——使用全部相机
                        selectedCameras = cameras;
                    } else if (totalCameras <= maxCameras) {
                        // 简化且不多于10个：全部使用
                        selectedCameras = cameras;
                    } else {
                        // 简化且超过10个：均匀分布选择10个
                        const indices: number[] = [];
                        for (let i = 0; i < maxCameras; i++) {
                            const index = Math.round(i * (totalCameras - 1) / (maxCameras - 1));
                            if (!indices.includes(index)) {
                                indices.push(index);
                            }
                        }
                        selectedCameras = indices.map(i => cameras[i]);
                    }

                    // 缓存源数据与选中 splat，用于 SIM 开关即时重建
                    lastLoadedCameras = cameras;
                    lastLoadedSplat = selectedSplat;

                    // 清除当前选中splat的关键帧
                    splatPoses.set(selectedSplat, []);

                    // 计算场景中心点（所有相机位置的平均值）——注意：使用“全部相机”而非仅选中的 10 个
                    const sceneCenter = new Vec3(0, 0, 0);
                    let validCameraCount = 0;
                    cameras.forEach((camera: any) => {
                        if (camera.position && Array.isArray(camera.position)) {
                            sceneCenter.add(new Vec3(camera.position));
                            validCameraCount++;
                        }
                    });
                    if (validCameraCount > 0) {
                        sceneCenter.mulScalar(1 / validCameraCount);
                    }

                    // 计算平均距离用于确定target距离
                    let averageDistance = 0;
                    if (validCameraCount > 0) {
                        selectedCameras.forEach((camera: any) => {
                            if (camera.position && Array.isArray(camera.position)) {
                                const pos = new Vec3(camera.position);
                                averageDistance += pos.distance(sceneCenter);
                            }
                        });
                        averageDistance /= Math.max(1, selectedCameras.length);
                        // 使用平均距离的一半作为target距离，确保target在场景内部
                        averageDistance = Math.max(averageDistance * 0.5, 1.0);
                    } else {
                        averageDistance = 5.0; // 默认距离
                    }

                    // 加载新的关键帧
                    const newPoses: Pose[] = [];
                    // 尝试在加载时用 setView 恢复 FOV/roll（仅首次调用一次）
                    let didSetInitialView = false;
                    
                    // 自适应调整 timeline 总帧数，保证相邻关键帧至少 18 帧
                    const minGap = 18;
                    const n = Math.max(1, selectedCameras.length);
                    const desiredSteps = Math.max(1, n - 1);
                    const baseFrames = Math.max(1, events.invoke('timeline.frames') || 1200);
                    const step = (n > 1) ? Math.max(minGap, Math.ceil((baseFrames - 1) / desiredSteps)) : 1;
                    const finalFrames = (n > 1) ? (step * desiredSteps + 1) : baseFrames;
                    events.fire('timeline.setFrames', finalFrames);

                    const frameForIndex = (i: number) => (n > 1) ? (i * step) : 0;

                    // reset maps for current selection before filling
                    frameImageNameMap.clear();
                    frameCameraIdMap.clear();
                    frameRawPosMap.clear();
                    frameRawRotMap.clear();

                    // 提取 fx, fy（多种来源）
                    const extractFxFy = (cam: any): { fx?: number, fy?: number } => {
                        let fx: number | undefined;
                        let fy: number | undefined;
                        if (typeof cam.fx === 'number') fx = cam.fx;
                        if (typeof cam.fy === 'number') fy = cam.fy;
                        if ((!fx || !fy) && cam.intrinsics) {
                            if (typeof cam.intrinsics.fx === 'number') fx = cam.intrinsics.fx;
                            if (typeof cam.intrinsics.fy === 'number') fy = cam.intrinsics.fy;
                        }
                        const toMat3 = (K: any): number[][] | null => {
                            if (!K) return null;
                            if (Array.isArray(K) && K.length === 3 && Array.isArray(K[0])) return K as number[][];
                            if (Array.isArray(K) && K.length === 9) {
                                return [
                                    [K[0], K[1], K[2]],
                                    [K[3], K[4], K[5]],
                                    [K[6], K[7], K[8]]
                                ];
                            }
                            return null;
                        };
                        if ((!fx || !fy) && cam.K) {
                            const K = toMat3(cam.K);
                            if (K) { fx = K[0][0]; fy = K[1][1]; }
                        }
                        return { fx, fy };
                    };

                    // 将旋转矩阵做坐标系转换（-x, -y, z）：左乘 T=diag(-1,-1,1)
                    const transformRotationFlipXY = (rot: any): number[][] | null => convertRotationToPlayCanvas(rot);

                    selectedCameras.forEach((cameraData: any, index: number) => {
                        // 基于 supersplat 的逻辑：当使用 position + rotation 时，
                        // 用旋转矩阵的第 3 列 z 作为前向，计算 (sceneCenter - p) 在 z 上的投影，
                        // 得到 target = p + dot * z；随后做坐标系转换：x/y 取反，z 保持。
                        const position = new Vec3(cameraData.position);

                        let outPosition = new Vec3(cameraData.position);
                        let outTarget: Vec3;

                        if (cameraData.target && Array.isArray(cameraData.target)) {
                            // 若有显式 target，保持原有逻辑（不修改坐标系约定）
                            outTarget = new Vec3(cameraData.target);
                        } else if (cameraData.rotation) {
                            // 取旋转矩阵第 3 列作为前向（兼容 3x3 或 9 元素数组）
                            const z = rotationCol3(cameraData.rotation);
                            if (z) {
                                const toCenter = sceneCenter.clone().sub(position);
                                const dot = toCenter.dot(z);
                                const targetFromRot = position.clone().add(z.clone().mulScalar(dot));

                                // 坐标系转换：与 supersplat 一致（-x, -y, z）
                                outPosition = new Vec3(-position.x, -position.y, position.z);
                                outTarget = new Vec3(-targetFromRot.x, -targetFromRot.y, targetFromRot.z);
                            } else {
                                outTarget = sceneCenter.clone();
                            }
                        } else {
                            // 无 rotation 与 target，指向场景中心
                            outTarget = sceneCenter.clone();
                        }

                        // 在首次可用时调用 setView 以恢复 FOV/roll
                        if (!didSetInitialView) {
                            const rotT = transformRotationFlipXY(cameraData.rotation);
                            const { fx, fy } = extractFxFy(cameraData);
                            if (rotT) {
                                // 若有显式 target 则一并变换
                                let tgtForView: Vec3 | undefined = undefined;
                                if (cameraData.target && Array.isArray(cameraData.target)) {
                                    const t = cameraData.target;
                                    tgtForView = new Vec3(-t[0], -t[1], t[2]);
                                } else if (outTarget) {
                                    tgtForView = outTarget.clone();
                                }
                                const posForView = new Vec3(-position.x, -position.y, position.z);
                                events.fire('camera.setView', {
                                    position: posForView,
                                    target: tgtForView,
                                    rotation: rotT,
                                    fx,
                                    fy,
                                    speed: 0
                                });
                                lastRotationForCaption = rotT.map(row => row.slice());
                                didSetInitialView = true;
                            }
                        }

                        // 均匀分布帧号，确保平滑过渡
                        const frame = frameForIndex(index);

                        // 记录期望的图片名称（用于稍后独立上传匹配）
                        const imageName = cameraData.img_name || cameraData.name;
                        if (imageName) {
                            frameImageNameMap.set(frame, String(imageName));
                        }
                        // store camera id for caption (prefer numeric id)
                        const idText = Number.isFinite(cameraData.id) ? String(cameraData.id) : (cameraData.name ?? imageName ?? `#${index}`);
                        frameCameraIdMap.set(frame, idText);
                        // store raw position / rotation for caption
                        if (cameraData.position && Array.isArray(cameraData.position) && cameraData.position.length === 3) {
                            frameRawPosMap.set(frame, [cameraData.position[0], cameraData.position[1], cameraData.position[2]]);
                        }
                        if (cameraData.rotation) {
                            let rot: number[] | null = null;
                            if (Array.isArray(cameraData.rotation) && cameraData.rotation.length === 3 && Array.isArray(cameraData.rotation[0])) {
                                rot = [
                                    cameraData.rotation[0][0], cameraData.rotation[0][1], cameraData.rotation[0][2],
                                    cameraData.rotation[1][0], cameraData.rotation[1][1], cameraData.rotation[1][2],
                                    cameraData.rotation[2][0], cameraData.rotation[2][1], cameraData.rotation[2][2]
                                ];
                            } else if (Array.isArray(cameraData.rotation) && cameraData.rotation.length === 9) {
                                rot = cameraData.rotation.slice(0, 9);
                            }
                            frameRawRotMap.set(frame, rot);
                        } else {
                            frameRawRotMap.set(frame, null);
                        }

                        newPoses.push({
                            name: cameraData.name || cameraData.img_name || `camera_${index}`,
                            frame: frame,
                            position: outPosition,
                            target: outTarget
                        });
                    });

                    splatPoses.set(selectedSplat, newPoses);
                    rebuildSpline();

                    // 同步时间轴关键帧标记（与手动添加一致）
                    const framesForTimeline = newPoses.map(p => p.frame);
                    events.fire('timeline.setSplatKeys', selectedSplat, framesForTimeline);
                    events.fire('timeline.selectionChanged');
                    // show a small info popup with how many keyframes were loaded
                    events.invoke('showPopup', {
                        type: 'info',
                        header: '加载完成',
                        message: `已加载 ${newPoses.length} 个关键帧。`
                    });

                    // 保留：不在此处弹出文件夹选择。请使用时间轴上的“上传图片文件夹”按钮进行独立上传。

                } catch (error) {
                    events.invoke('showPopup', {
                        type: 'error',
                        header: '加载失败',
                        message: `文件解析错误: ${error.message || error}`
                    });
                }
            };
            reader.readAsText(file);
        };

        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    });

    // 自动加载 cameras.json 内容（与 camera.loadKeys 逻辑类似，但直接接收数组）
    events.on('camera.autoLoadCameras', (camerasData: any[]) => {
        if (!Array.isArray(camerasData) || camerasData.length === 0) {
            console.warn('[autoLoadCameras] invalid camerasData');
            return;
        }
        const selectedSplat = events.invoke('selection') as Splat;
        if (!selectedSplat) {
            console.warn('[autoLoadCameras] no splat selected');
            return;
        }
        // 复制 camera.loadKeys 里排序 + 选取 + 时间轴分配逻辑（简化：不重复 popup 提示）
        const extractIdx = (name: string) => {
            if (!name) return Number.MAX_SAFE_INTEGER;
            const m = String(name).match(/(\d+)(?!.*\d)/);
            return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
        };
        let cameras: any[] = camerasData.slice();
        const withNumeric = cameras.filter(c => Number.isFinite(extractIdx(c?.img_name || c?.name)) && extractIdx(c?.img_name || c?.name) !== Number.MAX_SAFE_INTEGER);
        if (withNumeric.length > 0) {
            cameras = cameras.slice().sort((a, b) => extractIdx(a?.img_name || a?.name) - extractIdx(b?.img_name || b?.name));
        }
        const total = cameras.length;
        const maxCameras = 10;
        let selectedCameras: any[] = [];
        if (!events.invoke('camera.simplify.get')) selectedCameras = cameras;
        else if (total <= maxCameras) selectedCameras = cameras; else {
            const indices: number[] = [];
            for (let i = 0; i < maxCameras; i++) {
                const idx = Math.round(i * (total - 1) / (maxCameras - 1));
                if (!indices.includes(idx)) indices.push(idx);
            }
            selectedCameras = indices.map(i => cameras[i]);
        }
        // 场景中心（全部相机）
        const sceneCenter = new Vec3(0, 0, 0);
        let validCount = 0;
        cameras.forEach(c => { if (c.position && Array.isArray(c.position)) { sceneCenter.add(new Vec3(c.position)); validCount++; } });
        if (validCount > 0) sceneCenter.mulScalar(1 / validCount);
        // 时间轴帧分配
        const minGap = 18;
        const n = Math.max(1, selectedCameras.length);
        const desiredSteps = Math.max(1, n - 1);
        const baseFrames = Math.max(1, events.invoke('timeline.frames') || 1200);
        const step = (n > 1) ? Math.max(minGap, Math.ceil((baseFrames - 1) / desiredSteps)) : 1;
        const finalFrames = (n > 1) ? (step * desiredSteps + 1) : baseFrames;
        events.fire('timeline.setFrames', finalFrames);
        const frameForIndex = (i: number) => (n > 1) ? (i * step) : 0;
        // 清空旧数据
        splatPoses.set(selectedSplat, []);
        frameImageNameMap.clear();
        frameCameraIdMap.clear();
        frameRawPosMap.clear();
        frameRawRotMap.clear();
        frameFxMap.clear();
        frameFyMap.clear();
        // 构建新 poses
        const newPoses: Pose[] = [];
        selectedCameras.forEach((cam: any, index: number) => {
            if (!cam.position || !Array.isArray(cam.position) || cam.position.length !== 3) return;
            const position = new Vec3(cam.position);
            let outPosition = new Vec3(cam.position);
            let outTarget: Vec3;
            if (cam.target && Array.isArray(cam.target)) {
                outTarget = new Vec3(cam.target);
            } else if (cam.rotation) {
                const z = rotationCol3(cam.rotation);
                if (z) {
                    const toCenter = sceneCenter.clone().sub(position);
                    const dot = toCenter.dot(z);
                    const targetFromRot = position.clone().add(z.clone().mulScalar(dot));
                    outPosition = new Vec3(-position.x, -position.y, position.z);
                    outTarget = new Vec3(-targetFromRot.x, -targetFromRot.y, targetFromRot.z);
                } else {
                    outTarget = sceneCenter.clone();
                }
            } else {
                outTarget = sceneCenter.clone();
            }
            const frame = frameForIndex(index);
            const imageName = cam.img_name || cam.name;
            if (imageName) frameImageNameMap.set(frame, String(imageName));
            const idText = Number.isFinite(cam.id) ? String(cam.id) : (cam.name ?? imageName ?? `#${index}`);
            frameCameraIdMap.set(frame, idText);
            if (cam.position && Array.isArray(cam.position) && cam.position.length === 3) {
                frameRawPosMap.set(frame, [cam.position[0], cam.position[1], cam.position[2]]);
            }
            if (cam.rotation) {
                let rot: number[] | null = null;
                if (Array.isArray(cam.rotation) && cam.rotation.length === 3 && Array.isArray(cam.rotation[0])) {
                    rot = [
                        cam.rotation[0][0], cam.rotation[0][1], cam.rotation[0][2],
                        cam.rotation[1][0], cam.rotation[1][1], cam.rotation[1][2],
                        cam.rotation[2][0], cam.rotation[2][1], cam.rotation[2][2]
                    ];
                } else if (Array.isArray(cam.rotation) && cam.rotation.length === 9) {
                    rot = cam.rotation.slice(0, 9);
                }
                frameRawRotMap.set(frame, rot);
            } else {
                frameRawRotMap.set(frame, null);
            }
            const intr = extractFxFyTop(cam);
            if (Number.isFinite(intr.fx)) frameFxMap.set(frame, intr.fx as number);
            if (Number.isFinite(intr.fy)) frameFyMap.set(frame, intr.fy as number);
            newPoses.push({
                name: cam.name || cam.img_name || `camera_${index}`,
                frame,
                position: outPosition,
                target: outTarget
            });
        });
        splatPoses.set(selectedSplat, newPoses);
        rebuildSpline();
        const framesForTimeline = newPoses.map(p => p.frame);
        events.fire('timeline.setSplatKeys', selectedSplat, framesForTimeline);
        events.fire('timeline.selectionChanged');
        // 关键帧建立后自动按名称加载图片（若已存在 base 路径）
        const base = (window as any).__GS_IMAGES_BASE__ as string | undefined;
        if (base) {
            events.fire('images.autoLoadFromBase', base);
        }
        console.log(`[autoLoadCameras] loaded ${newPoses.length} poses`);
    });

    // 自动图片加载：根据 frameImageNameMap + base 逐个构造 URL 并加载
    events.on('images.autoLoadFromBase', (baseDir: string) => {
        if (!baseDir) return;
        if (frameImageNameMap.size === 0) {
            console.warn('[images.autoLoadFromBase] no frameImageNameMap entries');
            return;
        }
        const base = String(baseDir).replace(/\/$/, '');
        frameImageMap.clear();
        let count = 0;
        const entries = Array.from(frameImageNameMap.entries());
        entries.forEach(([frame, name]) => {
            const raw = String(name);
            const candidates = [raw, `${raw}.png`, `${raw}.jpg`, `${raw}.jpeg`, `${raw}.webp`];
            let chosen: string | null = null;
            for (const c of candidates) { chosen = c; break; }
            if (!chosen) return;
            const url = `${base}/${chosen}`;
            const img = new Image();
            img.onload = () => {
                const arr = frameImageMap.get(frame) || [];
                arr.push(img);
                frameImageMap.set(frame, arr);
                const cur = events.invoke('timeline.frame');
                showImagesForFrame(cur);
            };
            img.onerror = () => { /* ignore */ };
            img.src = url;
            count++;
        });
        console.log(`[images.autoLoadFromBase] scheduled ${count} image loads from ${base}`);
        const cur = events.invoke('timeline.frame');
        showImagesForFrame(cur);
    });

    // 独立的图片文件夹上传事件处理：匹配已记录的 frame -> imageName
    events.on('images.uploadFolder', () => {
        // 如果还没有加载任何相机或未记录名称映射，提示用户
        if (frameImageNameMap.size === 0) {
            events.invoke('showPopup', {
                type: 'warning',
                header: '未找到相机帧映射',
                message: '请先加载相机/关键帧后再上传图片文件夹，以便按帧匹配图片。'
            });
            // 不弹出文件夹选择窗口，直接返回
            return;
        }

        const dirInput = document.createElement('input');
        dirInput.type = 'file';
        // @ts-ignore - webkitdirectory is a non-standard prop supported by browsers
        (dirInput as any).webkitdirectory = true;
        dirInput.multiple = true;
        dirInput.accept = 'image/*';
    dirInput.style.display = 'none';

    dirInput.onchange = (ev: Event) => {
            const inputEl = ev.target as HTMLInputElement;
            const files = inputEl.files;
            if (!files || files.length === 0) {
                document.body.removeChild(dirInput);
                return;
            }

            // 清空当前已加载的图片（避免残留）
            frameImageMap.clear();

            // 建立名称 -> File 的映射（包含去扩展名的键）
            const fileMap = new Map<string, File>();
            for (let i = 0; i < files.length; ++i) {
                const f = files[i];
                fileMap.set(f.name, f);
                const bare = f.name.replace(/\.[^/.]+$/, '');
                if (!fileMap.has(bare)) fileMap.set(bare, f);
            }

            const exts = ['.png', '.jpg', '.jpeg', '.webp'];

            let matched = 0;
            let total = frameImageNameMap.size;

            for (const [frame, imgNameRaw] of frameImageNameMap.entries()) {
                const imgName = String(imgNameRaw);
                let matchedFile: File | undefined = undefined;

                // 1) 精确匹配
                matchedFile = fileMap.get(imgName);

                // 2) 带常见扩展名
                if (!matchedFile) {
                    for (const ext of exts) {
                        const key = imgName + ext;
                        if (fileMap.has(key)) { matchedFile = fileMap.get(key); break; }
                    }
                }

                // 3) 不区分大小写的包含匹配
                if (!matchedFile) {
                    const lower = imgName.toLowerCase();
                    for (const [k, f] of fileMap.entries()) {
                        if (k.toLowerCase().includes(lower)) { matchedFile = f; break; }
                    }
                }

                if (matchedFile) {
                    matched++;
                    // 首次匹配到图片时先确保容器存在（避免 onload 前用户看不到任何反馈）
                    if (matched === 1) {
                        ensureOverlay();
                    }
                    const url = URL.createObjectURL(matchedFile);
                    const img = new Image();
                    img.src = url;
                    img.onload = () => {
                        const arr = frameImageMap.get(frame) || [];
                        arr.push(img);
                        frameImageMap.set(frame, arr);
                        // 刷新显示（按需创建容器）
                        const cur = events.invoke('timeline.frame');
                        showImagesForFrame(cur);
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                    };

                    // 记录名称到URL的缓存，便于 SIM 切换后重建映射
                    const lowerFull = matchedFile.name.toLowerCase();
                    const lowerBare = lowerFull.replace(/\.[^/.]+$/, '');
                    imageUrlByName.set(lowerFull, url);
                    imageUrlByName.set(lowerBare, url);
                }
            }

            document.body.removeChild(dirInput);

            events.invoke('showPopup', {
                type: 'info',
                header: '图片匹配完成',
                message: `已匹配 ${matched}/${total} 帧的图片。`
            });

            // 触发刷新
            events.fire('timeline.selectionChanged');
            const cur = events.invoke('timeline.frame');
            showImagesForFrame(cur);
        };

        document.body.appendChild(dirInput);
        dirInput.click();
    });

    // 根据 frameImageNameMap 与缓存的 URL 重建 frame->images 映射
    const rebuildFrameImagesFromNames = (allowedFrames?: Set<number>) => {
        frameImageMap.clear();
        let mappedCount = 0;
        for (const [frame, imgNameRaw] of frameImageNameMap.entries()) {
            if (allowedFrames && !allowedFrames.has(frame)) continue;
            const base = String(imgNameRaw).toLowerCase();
            const candidates = [base, `${base}.png`, `${base}.jpg`, `${base}.jpeg`, `${base}.webp`];
            let url: string | undefined;
            for (const k of candidates) {
                if (imageUrlByName.has(k)) { url = imageUrlByName.get(k)!; break; }
            }
            if (url) {
                if (mappedCount === 0) ensureOverlay();
                const img = new Image();
                img.src = url;
                img.onload = () => {
                    const arr = frameImageMap.get(frame) || [];
                    arr.push(img);
                    frameImageMap.set(frame, arr);
                    const cur = events.invoke('timeline.frame');
                    showImagesForFrame(cur);
        };
        mappedCount++;
            }
    }
    };

    // doc

    events.function('docSerialize.poseSets', (): any[] => {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        const result: any[] = [];

        // 序列化所有splat的poses数据
        splatPoses.forEach((poses, splat) => {
            if (poses.length > 0) {
                result.push({
                    name: splat.name,
                    poses: poses.map((pose) => {
                        return {
                            name: pose.name,
                            frame: pose.frame,
                            position: pack3(pose.position),
                            target: pack3(pose.target)
                        };
                    })
                });
            }
        });

        return result;
    });

    events.function('docDeserialize.poseSets', (poseSets: any[]) => {
        if (poseSets.length === 0) {
            return;
        }

        const fps = events.invoke('timeline.frameRate');

        // 延迟恢复，等待所有splat加载完成
        setTimeout(() => {
            const allSplats = events.invoke('scene.allSplats') as Splat[];
            
            poseSets.forEach((poseSet: any) => {
                // 根据名称找到对应的splat
                const splat = allSplats.find(s => s.name === poseSet.name);
                if (splat && poseSet.poses) {
                    const poses: Pose[] = [];
                    poseSet.poses.forEach((docPose: any, index: number) => {
                        poses.push({
                            name: docPose.name,
                            frame: docPose.frame ?? (index * fps),
                            position: new Vec3(docPose.position),
                            target: new Vec3(docPose.target)
                        });
                    });
                    splatPoses.set(splat, poses);
                }
            });

            // 如果有当前选择，重建spline
            const currentSelection = events.invoke('selection') as Splat;
            if (currentSelection && splatPoses.has(currentSelection)) {
                rebuildSpline();
            }
        }, 100);
    });

    // 监听 .ply 文件上传事件（仅确保面板可见，内容由统一的实时更新驱动）
    events.on('file.upload', (file) => {
        if (file.name.endsWith('.ply')) {
            captionBox!.style.display = 'block';
        }
    });

    // 跳转到最近关键帧事件处理
    let jumpAnimHandle: EventHandle | null = null;
    events.on('camera.jumpToNearestPose', () => {
        // 获取当前选中 splat 的关键帧列表
        const poses = getCurrentSplatPoses();
        if (!poses || poses.length === 0) {
            events.invoke('showPopup', {
                type: 'warning',
                header: '没有关键帧',
                message: '当前选中的 Splat 没有关键帧，请先加载或添加关键帧。'
            });
            return;
        }

        // 获取当前相机位置
        const camPose = events.invoke('camera.getPose');
        if (!camPose || !camPose.position) return;

        const camPos = new Vec3(camPose.position.x, camPose.position.y, camPose.position.z);

        // 找到 position 最近的关键帧
        let nearest: Pose | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const p of poses) {
            const d = camPos.distance(p.position);
            if (d < bestDist) {
                bestDist = d;
                nearest = p;
            }
        }

        if (!nearest) return;

        // 若正在播放，先暂停，避免干扰
        if (events.invoke('timeline.playing')) {
            events.fire('timeline.setPlaying', false);
        }

        // 若有未结束的跳转，先取消
        if (jumpAnimHandle) {
            jumpAnimHandle.off();
            jumpAnimHandle = null;
        }

        const durationSec = 3.0;
        const fixedStep = 1 / 60; // 60fps
        const startFrame: number = events.invoke('timeline.frame');
        const endFrame: number = nearest.frame;
        const frameDelta = endFrame - startFrame;

        // 明确：始终从“当前相机姿态”插值到“最近关键帧姿态”
        const startPoseNow = events.invoke('camera.getPose');
        const startPos = new Vec3(startPoseNow.position.x, startPoseNow.position.y, startPoseNow.position.z);
        const startTgt = new Vec3(startPoseNow.target.x, startPoseNow.target.y, startPoseNow.target.z);

        // 起始旋转：取当前相机实体四元数；注意 entity.forward = -Z（引擎空间）。
        // 为与 setView 的“预翻转空间”（[right, up, forward]，随后在 setView 中做 [r, -u, -f]）一致，
        // 需要把引擎四元数先转成矩阵 B，再还原到预翻转基 Mpre=[B0, -B1, -B2]，再生成 qStart。
        const camEnt = events.invoke('camera.entity');
        let qStart: QuatT | null = null;
        if (camEnt && typeof camEnt.getRotation === 'function') {
            const q = camEnt.getRotation();
            if (q) {
                const B = mat3FromQuat({ x: q.x, y: q.y, z: q.z, w: q.w });
                const Mpre = [
                    [ B[0][0], -B[0][1], -B[0][2] ],
                    [ B[1][0], -B[1][1], -B[1][2] ],
                    [ B[2][0], -B[2][1], -B[2][2] ]
                ];
                qStart = quatFromMat3(Mpre);
            }
        }
        if (!qStart) {
            // fallback: build look-at orientation from start forward
            const fwd = startTgt.clone().sub(startPos).normalize();
            const up = new Vec3(0, 1, 0);
            let right = new Vec3().cross(up, fwd);
            if (right.length() < 1e-4) {
                // choose alternate up if degenerate
                up.set(0, 0, 1);
                right = new Vec3().cross(up, fwd);
            }
            right.normalize();
            const realUp = new Vec3().cross(fwd, right).normalize();
            const m = [
                [right.x, realUp.x, fwd.x],
                [right.y, realUp.y, fwd.y],
                [right.z, realUp.z, fwd.z]
            ];
            qStart = quatFromMat3(m);
        }

        // 目标旋转：优先使用该关键帧的原始旋转（经 flipXY 转至 PlayCanvas），否则由 position->target 构造
        let qEnd: QuatT | null = null;
        const rawRotEnd = frameRawRotMap.get(endFrame);
        if (rawRotEnd) {
            const mEnd = flipXYRotation(rawRotEnd);
            if (mEnd) qEnd = quatFromMat3(mEnd);
        }
        if (!qEnd) {
            const fwd = nearest.target.clone().sub(nearest.position).normalize();
            const up = new Vec3(0, 1, 0);
            let right = new Vec3().cross(up, fwd);
            if (right.length() < 1e-4) { up.set(0, 0, 1); right = new Vec3().cross(up, fwd); }
            right.normalize();
            const realUp = new Vec3().cross(fwd, right).normalize();
            const m = [
                [right.x, realUp.x, fwd.x],
                [right.y, realUp.y, fwd.y],
                [right.z, realUp.z, fwd.z]
            ];
            qEnd = quatFromMat3(m);
        }

        let elapsed = 0;
        let acc = 0;

    jumpInProgress = true;
    jumpAnimHandle = events.on('update', (dt: number) => {
            elapsed += dt;
            acc += dt;

            // 按固定步长推进，确保约 60fps 的插值采样
            let advanced = false;
            while (acc >= fixedStep) {
                acc -= fixedStep;
                advanced = true;
                const t = Math.min(1, elapsed / durationSec);

                // 推进并同步时间轴帧
                const lerpFrameF = startFrame + frameDelta * t;
                const currFrame = Math.round(lerpFrameF);
                events.fire('timeline.setFrame', currFrame);

                // 手动插值相机姿态：位置线性，旋转四元数球面插值
                const pos = startPos.clone();
                pos.lerp(startPos, nearest!.position, t);

                let rotMat: number[][] | null = null;
                if (qStart && qEnd) {
                    const qi = quatSlerp(qStart, qEnd, t);
                    rotMat = mat3FromQuat(qi);
                }

                if (rotMat) {
                    events.fire('camera.setView', {
                        position: pos,
                        rotation: rotMat,
                        speed: 0
                    });
                } else {
                    // fallback：无旋转信息时仅移动位置
                    events.fire('camera.setPose', { position: pos, target: nearest!.target }, 0);
                }

                if (t >= 1) {
                    // 结束：对齐到精确目标并将时间轴停在关键帧
                    events.fire('timeline.setFrame', endFrame);
                    // 终态应用：使用目标旋转矩阵（若可得）
                    let finalMat: number[][] | null = null;
                    if (rawRotEnd) {
                        finalMat = flipXYRotation(rawRotEnd);
                    }
                    if (!finalMat && qEnd) finalMat = mat3FromQuat(qEnd);
                    if (finalMat) {
                        events.fire('camera.setView', {
                            position: nearest!.position,
                            rotation: finalMat,
                            speed: 0
                        });
                    } else {
                        events.fire('camera.setPose', { position: nearest!.position, target: nearest!.target }, 0);
                    }
                    jumpAnimHandle!.off();
                    jumpAnimHandle = null;
                    jumpInProgress = false;
                    return;
                }
            }

            // 如果这一帧未达到固定步长，至少保持时间推进到目标时长
            if (!advanced && elapsed >= durationSec) {
                events.fire('timeline.setFrame', endFrame);
                let finalMat: number[][] | null = null;
                if (rawRotEnd) finalMat = flipXYRotation(rawRotEnd);
                if (!finalMat && qEnd) finalMat = mat3FromQuat(qEnd);
                if (finalMat) {
                    events.fire('camera.setView', { position: nearest!.position, rotation: finalMat, speed: 0 });
                } else {
                    events.fire('camera.setPose', { position: nearest!.position, target: nearest!.target }, 0);
                }
                jumpAnimHandle!.off();
                jumpAnimHandle = null;
                jumpInProgress = false;
            }
        });
    });
};

export { registerCameraPosesEvents, Pose };
