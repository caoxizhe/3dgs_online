// Pure JS Frontend replacing Gradio, preserving original logic and adding React-style features.
// Config
const API_BASE = (window.BACKEND_URL) || (localStorage.getItem('BACKEND_URL') || 'http://127.0.0.1:8000');
console.log('[frontend] API_BASE =', API_BASE);

// State
const state = {
  projects: [], // { job_id, scene, upload_type, log_url, status_url, done?, stage?, zip_url?, point_cloud_url?, cameras_url? }
  polling: null,
  currentMode: 'files',
  currentFiles: null,
  currentJob: null
};

// Elements
const gridEl = document.getElementById('projectsGrid');
const createModal = document.getElementById('createModal');
const openCreateBtn = document.getElementById('openCreate');
const newShortcut = document.getElementById('newShortcut');
const cancelCreate = document.getElementById('cancelCreate');
const startBtn = document.getElementById('startBtn');
const sceneNameInput = document.getElementById('sceneName');
const modeSwitch = document.getElementById('modeSwitch');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
// Log modal
const logModal = document.getElementById('logModal');
const logBody = document.getElementById('logBody');
const logTitle = document.getElementById('logTitle');
// 已移除 log 模态中的查看器按钮
const closeLog = document.getElementById('closeLog');

// Helpers
const fmtBytes = (n) => {
  if (!n) return '0B';
  const u = ['B','KB','MB','GB'];
  let i=0; while(n>1024 && i<u.length-1){ n/=1024; i++; } return n.toFixed(1)+u[i];
};

function renderProjects() {
  // Clear except new button
  [...gridEl.querySelectorAll('.card')].forEach(e=>e.remove());
  state.projects.forEach(p => {
    const card = document.createElement('div');
    card.className='card';
    const thumb = document.createElement('img');
  thumb.src = p.cover_url || p.thumbnail || 'https://via.placeholder.com/640x360/111/333?text=Processing';
    card.appendChild(thumb);
    const body = document.createElement('div'); body.className='card-body';
    const title = document.createElement('div'); title.style.fontWeight='600'; title.textContent = p.scene || p.job_id; body.appendChild(title);
    const badges = document.createElement('div'); badges.className='badge-row';
    const badge = document.createElement('div'); badge.className='badge';
    if (p.error) { badge.classList.add('badge-fail'); badge.textContent='FAILED'; }
    else if (p.done) { badge.classList.add('badge-ok'); badge.textContent='READY'; }
    else { badge.classList.add('badge-run'); badge.textContent=p.stage||'RUNNING'; }
    badges.appendChild(badge); body.appendChild(badges);
    const actions = document.createElement('div'); actions.className='actions';
  const logBtn = document.createElement('button'); logBtn.className='btn-sm'; logBtn.innerHTML='<span class="icon" data-icon="log"></span>日志'; logBtn.onclick=()=>showLogs(p);
    actions.appendChild(logBtn);
  if (p.zip_url) { const dl = document.createElement('a'); dl.href=API_BASE + p.zip_url; dl.target='_blank'; dl.className='btn-sm'; dl.innerHTML='<span class="icon" data-icon="download"></span>ZIP'; actions.appendChild(dl); }
  if (p.done) { const view = document.createElement('button'); view.className='btn-sm'; view.innerHTML='<span class="icon" data-icon="eye"></span>查看'; view.onclick=()=>openViewer(p.job_id); actions.appendChild(view); }
  const del = document.createElement('button'); del.className='btn-sm danger'; del.innerHTML='<span class="icon" data-icon="trash"></span>删除'; del.onclick=()=>deleteProject(p.job_id); actions.appendChild(del);
    body.appendChild(actions);
    card.appendChild(body);
    gridEl.appendChild(card);
  });
  // 渲染后补齐图标
  if (window.injectIcons) window.injectIcons(gridEl);
}

function showCreate() { createModal.style.display='flex'; }
function hideCreate() { createModal.style.display='none'; }
function refreshStartEnabled() { startBtn.disabled = !(sceneNameInput.value.trim() && state.currentFiles && state.currentFiles.length>0); }

modeSwitch.addEventListener('click', (e)=>{
  if (e.target.tagName==='BUTTON') {
    [...modeSwitch.children].forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    state.currentMode = e.target.dataset.mode;
    // adjust file input attributes
    fileInput.multiple = state.currentMode !== 'zip';
    if (state.currentMode === 'folder') { fileInput.setAttribute('webkitdirectory',''); fileInput.multiple=true; }
    else { fileInput.removeAttribute('webkitdirectory'); }
  }
});

dropZone.addEventListener('click', ()=> fileInput.click());
dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', ()=> dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', (e)=>{ e.preventDefault(); dropZone.classList.remove('drag'); state.currentFiles = e.dataTransfer.files; fileInfo.textContent=`已选择 ${state.currentFiles.length} 个文件，总计 ${fmtBytes([...state.currentFiles].reduce((a,f)=>a+f.size,0))}`; refreshStartEnabled(); });
fileInput.addEventListener('change', ()=>{ state.currentFiles = fileInput.files; fileInfo.textContent=`已选择 ${state.currentFiles.length} 个文件，总计 ${fmtBytes([...state.currentFiles].reduce((a,f)=>a+f.size,0))}`; refreshStartEnabled(); });
sceneNameInput.addEventListener('input', refreshStartEnabled);

openCreateBtn.onclick = showCreate; newShortcut.onclick = showCreate; cancelCreate.onclick = hideCreate;

async function startJob() {
  if (!state.currentFiles || state.currentFiles.length===0) return;
  const fd = new FormData();
  fd.append('scene_name', sceneNameInput.value.trim());
  fd.append('upload_type', state.currentMode);
  [...state.currentFiles].forEach(f => fd.append('files', f));
  startBtn.disabled=true; startBtn.textContent='上传中…';
  try {
    const r = await fetch(`${API_BASE}/reconstruct_stream`, { method:'POST', body:fd });
    if (!r.ok) throw new Error('上传失败 '+r.status);
  const js = await r.json();
  state.projects.unshift({ job_id:js.job_id, scene:js.scene, upload_type:js.upload_type, log_url:js.log_url, status_url:js.status_url, stage:'Queued', done:false, cover_url: js.cover_url });
    renderProjects(); hideCreate();
  } catch(e){ alert('提交失败: '+e.message); } finally { startBtn.disabled=false; startBtn.textContent='开始重建'; }
}
startBtn.onclick = startJob;

function poll() {
  state.projects.forEach(async p => {
    if (p.done || p.error) return;
    try {
      const r = await fetch(`${API_BASE}/result/${p.job_id}`); if (!r.ok) return;
      const js = await r.json();
      if (js.error) { p.error = js.error; } else {
        p.stage = js.stage || p.stage;
        if (js.done) {
          p.done = true;
          p.zip_url = js.zip_url; p.point_cloud_url = js.point_cloud_url; p.cameras_url = js.cameras_url;
        }
        if (js.cover_url && !p.cover_url) p.cover_url = js.cover_url;
      }
      renderProjects();
    } catch(e) { /* ignore */ }
  });
}
state.polling = setInterval(poll, 3000);

function showLogs(project) {
  state.currentJob = project.job_id; logTitle.textContent = project.job_id; logModal.style.display='flex';
  logBody.innerHTML='';
  fetchLogsLoop();
}
closeLog.onclick = ()=> { logModal.style.display='none'; state.currentJob=null; };

async function fetchLogsLoop() {
  if (!state.currentJob) return;
  try {
    const p = state.projects.find(x=>x.job_id===state.currentJob);
    if (p && p.log_url) {
      const r = await fetch(API_BASE + p.log_url); if (r.ok){ const txt = await r.text(); const lines = txt.split(/\n/); logBody.innerHTML = lines.map((l,i)=>`<div class='log-line'><span style='opacity:.35;width:40px;text-align:right;'>${i+1}</span><span>${l.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span></div>`).join(''); logBody.scrollTop = logBody.scrollHeight; }
    }
  } catch(e){ /* ignore */ }
  setTimeout(fetchLogsLoop, 2000);
}

async function openViewer(job_id) {
  try {
    const r = await fetch(`${API_BASE}/viewer/${encodeURIComponent(job_id)}`); if (!r.ok) throw new Error('viewer请求失败');
    const js = await r.json(); const url = js.editor_url; if (url) window.open(url.startsWith('http')?url:(API_BASE+url),'_blank'); else alert('无有效editor_url');
  } catch(e){ alert('打开失败: '+e.message); }
}
openViewerBtn.onclick = ()=> { if (state.currentJob) openViewer(state.currentJob); };

function deleteProject(job_id) {
  if (!confirm('确认删除任务 '+job_id+' 及其本地记录?')) return;
  state.projects = state.projects.filter(p=>p.job_id!==job_id); renderProjects();
  // 后端删除(若实现). 忽略错误.
  fetch(`${API_BASE}/delete/${encodeURIComponent(job_id)}`, { method:'DELETE' }).catch(()=>{});
}

// Initial render
renderProjects();

// Persist local (optional)
window.addEventListener('beforeunload', ()=>{
  try { localStorage.setItem('gs_projects_snapshot', JSON.stringify(state.projects)); } catch(e){}
});
try { const snap = localStorage.getItem('gs_projects_snapshot'); if (snap) { state.projects = JSON.parse(snap); renderProjects(); } } catch(e){}
