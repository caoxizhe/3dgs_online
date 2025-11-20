// 本代码的功能：根据传入或页面内容推断 job_id，调用 /viewer/{job_id}（已在backend/main.py中挂载），打开新页标签。
(job) => {
  if (!job) {
    try {
      const el = document.getElementById('result_list');
      const text = el ? (el.innerText || el.textContent || '') : '';
      const m = text.match(/\/logs\/([^\/\s]+)\.log/);
      if (m && m[1]) job = m[1];
    } catch(e) { /* ignore */ }
  }
  if (!job) {
    alert('job_id 为空，无法打开3dgs查看器');
    return;
  }
  const OUT_BACKEND = '${BACKEND_URL}';
  // 获取 /viewer/{job_id} 形式的3dgs查看器链接。
  (async () => {
    for (const u of [`${OUT_BACKEND}/viewer/${encodeURIComponent(job)}`]) {
      try {
        const r = await fetch(u);
        if (!r.ok) continue;
        const d = await r.json();
        if (d && d.editor_url) {
          const final = d.editor_url.startsWith('http') ? d.editor_url : (OUT_BACKEND + d.editor_url);
          window.open(final, '_blank', 'noopener');
          return;
        }
      } catch (e) { /* ignore and try next */ }
    }
    alert('获取3dgs查看器链接失败');
  })();
}
