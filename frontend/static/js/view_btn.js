(job) => {
  const PERF = { start: performance.now(), steps: [] };
  const mark = (name, extra) => { const t = performance.now() - PERF.start; PERF.steps.push({ name, t: t.toFixed(1)+'ms', extra }); console.log('[viewer:step]', name, extra||'', t.toFixed(1)+'ms'); };

  // 诊断条与复制报告按钮
  try {
    let bar = document.getElementById('viewer-diagnostics');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'viewer-diagnostics';
      bar.style.cssText = 'position:sticky;top:0;z-index:9999;background:#111827;color:#e5e7eb;padding:8px 12px;border:1px solid #374151;border-radius:6px;display:flex;align-items:center;gap:8px;font:12px/1.4 ui-monospace,monospace';
      bar.innerHTML = '<b>Viewer</b> <span id="vd-msg"></span> <button id="vd-copy" style="background:#1f2937;color:#9ca3af;border:1px solid #374151;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:12px">复制报告</button>';
      document.body && document.body.prepend(bar);
      const copyBtn = document.getElementById('vd-copy');
      copyBtn && copyBtn.addEventListener('click', () => {
        const report = JSON.stringify({ job, PERF, lastResponse, resourcesProbe }, null, 2);
        navigator.clipboard.writeText(report).then(() => { copyBtn.textContent='已复制'; setTimeout(()=>copyBtn.textContent='复制报告',1200); });
      });
    }
    const setMsg = (m) => { const el = document.getElementById('vd-msg'); if (el) el.textContent = ' - ' + m; console.log('[viewer]', m); };
    setMsg('初始化…');
    mark('init');
  } catch(e) { console.warn('diagnostic bar error', e); }

  // job_id 推断
  if (!job) {
    try {
      const el = document.getElementById('result_list');
      const text = el ? (el.innerText || el.textContent || '') : '';
      const m = text.match(/\/logs\/([^\/\s]+)\.log/);
      if (m && m[1]) job = m[1];
      mark('infer_job_from_log', { found: !!job });
    } catch(e) { mark('infer_job_error', { err: String(e) }); }
  }
  if (!job) {
    alert('job_id 为空，无法打开编辑器');
    try { const s=document.getElementById('vd-msg'); if (s) s.textContent=' - 失败：job_id 为空'; } catch(_){}
    return;
  }

  const viewerApiAbs = '${BACKEND_URL}' + '/viewer/' + encodeURIComponent(job);
  const viewerApiRel = '/viewer/' + encodeURIComponent(job);
  const tryFetch = (url) => fetch(url).then(r => ({ ok:r.ok, status:r.status, json:() => r.json(), headers:r.headers, url }));
  mark('build_urls', { viewerApiAbs, viewerApiRel });

  // 获取 editor_url 并在当前页面发起新标签导航，避免 data:URL 的空白页问题
  const OUT_BACKEND = '${BACKEND_URL}';
  async function fetchEditorUrl(jobId){
    for (const u of [`${OUT_BACKEND}/viewer/${encodeURIComponent(jobId)}`, `/viewer/${encodeURIComponent(jobId)}`]){
      try { const r = await fetch(u); if (r.ok) { const d = await r.json(); if (d?.editor_url) return d.editor_url; } } catch(_) {}
    }
    // 退化：尝试 /result/{job} 拼 editor_url
    for (const u of [`${OUT_BACKEND}/result/${encodeURIComponent(jobId)}`, `/result/${encodeURIComponent(jobId)}`]){
      try { const r = await fetch(u); if (!r.ok) continue; const j = await r.json();
        // 尝试从返回里提取 ply / cameras / images
        const pickStr = (pred) => {
          for (const v of Object.values(j)) {
            if (typeof v === 'string' && pred(v)) return v;
          }
          // 深层扫描
          const stack = [j];
          while (stack.length) {
            const o = stack.pop();
            if (o && typeof o === 'object') {
              for (const k of Object.keys(o)) {
                const v = o[k];
                if (typeof v === 'string' && pred(v)) return v;
                if (v && typeof v === 'object') stack.push(v);
              }
            }
          }
          return null;
        };
        const ply = pickStr(v=>/\.ply($|\?)/i.test(v));
        const cams = pickStr(v=>/cameras\.json($|\?)/i.test(v));
        // 优先显式 uploads/<job>/input 目录
        let images = pickStr(v=>/\/uploads\/[^/]+\/input\/?$/i.test(v));
        if (!images) images = `/uploads/${jobId}/input`;
        if (ply && cams) {
          const q = new URLSearchParams({ ply: encodeURI(ply), cameras: encodeURI(cams), images: encodeURI(images) }).toString();
          return `/gs_editor/dist/index.html?${q}`;
        }
      } catch(_) {}
    }
    throw new Error('无法确定 editor_url');
  }

  const updateBar = (m) => { try { const s=document.getElementById('vd-msg'); if (s) s.textContent=' - ' + m; } catch(_){} };

  // 若弹窗被阻止，改为当前页打开
  const inPageFallback = (editorUrlFetcher) => {
    updateBar('弹窗被阻止，已提供外部链接');
    mark('fallback_in_page');
    const host = document.getElementById('viewer-diagnostics');
    editorUrlFetcher()
      .then(data => {
        const u = data && data.editor_url; if (!u) throw new Error('editor_url 缺失');
        const final = (u.startsWith('http')) ? u : ('${BACKEND_URL}' + u);
        const a = document.createElement('a');
        a.href = final; a.textContent = '打开 3DGS 查看器'; a.target = '_blank'; a.style.marginLeft='8px';
        a.rel='noopener';
        host && host.appendChild(a);
      })
      .catch(e => {
        const span = document.createElement('span'); span.style.color='#ef4444'; span.textContent='获取链接失败: '+e;
        host && host.appendChild(span);
      });
  };

  // 构建候选地址（包含主机替换）
  const makeSwappedAbs = () => {
    try {
      const u = new URL('${BACKEND_URL}');
      const swapped = new URL(u.toString());
      swapped.hostname = window.location.hostname;
      return swapped.origin + '/viewer/' + encodeURIComponent(job);
    } catch (_) { return null; }
  };
  const swappedAbs = makeSwappedAbs();
  const candidates = [viewerApiAbs];
  if (swappedAbs && swappedAbs !== viewerApiAbs) candidates.push(swappedAbs);
  candidates.push(viewerApiRel);
  mark('candidates_ready', { candidates });
  // 在当前页面取链接再新开标签，避免 data:URL 的跨源限制
  (async () => {
    try {
      updateBar('获取链接…');
      const editorUrl = await fetchEditorUrl(job);
      const final = editorUrl.startsWith('http') ? editorUrl : (OUT_BACKEND + editorUrl);
      // 放兜底直链
      const hostBar = document.getElementById('viewer-diagnostics');
      const fallbackLink = document.createElement('a'); fallbackLink.href = final; fallbackLink.target = '_blank'; fallbackLink.rel='noopener'; fallbackLink.textContent='打开 3DGS 查看器'; fallbackLink.style.marginLeft='8px';
      hostBar && hostBar.appendChild(fallbackLink);
      // 新标签打开
      window.open(final, '_blank', 'noopener');
      updateBar('已在新标签页打开');
    } catch(e) {
      updateBar('自动获取链接失败，已提供兜底链接');
      // 再次尝试构造 /gs_editor 直链作为兜底
      const hostBar = document.getElementById('viewer-diagnostics');
      const manual = `/gs_editor/dist/index.html`;
      const a = document.createElement('a'); a.href = manual; a.target='_blank'; a.rel='noopener'; a.textContent='打开 3DGS 查看器（基础页）'; a.style.marginLeft='8px';
      hostBar && hostBar.appendChild(a);
      console.warn('viewer open failed', e);
    }
  })();
  return;
}
