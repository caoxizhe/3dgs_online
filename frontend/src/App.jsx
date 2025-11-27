import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, User, Menu, Upload, X, Loader2, Play, FileArchive, 
  Folder, Image as ImageIcon, Terminal, Download, CheckCircle, AlertCircle, Trash2, Zap, Box, Cuboid
} from 'lucide-react';

// --- Configuration ---
const API_BASE_URL = ""; 


// --- UI 组件 ---

// 顶部导航栏组件 navigation bar
const Navbar = ({ onCreateClick }) => (
  <nav className="flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-md sticky top-0 z-50 border-b border-white/10">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
        <span className="text-white font-bold text-lg">GS</span>
      </div>
      <span className="text-white font-semibold text-xl tracking-tight">3DGS Online</span>
    </div>
    
    <div className="flex items-center gap-4">
      <button 
        onClick={onCreateClick}
        className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full text-sm font-bold hover:bg-gray-200 transition-all active:scale-95 shadow-lg shadow-white/5"
      >
        <Plus size={16} strokeWidth={3} />
        <span>创建</span>
      </button>
    </div>
  </nav>
);




// --- 项目卡片 --- 
// 功能：显示项目状态（处理中、完成、失败），提供查看3D视图、查看日志和删除项目的操作入口
const ProjectCard = ({ project, onClick, onViewLogs, onDelete }) => {
  // 判断项目状态
  const isProcessing = !project.done && project.status !== 'failed';
  const isFailed = project.status === 'failed';

  // 封面逻辑：完成任务用原始图片第一张，失败任务用默认图片
  let coverUrl = null;
  if (!isProcessing && !isFailed && project.cover_url) {
    coverUrl = `${API_BASE_URL}${project.cover_url}`;
  } else if (isFailed) {
    coverUrl = 'https://images.unsplash.com/photo-1621569898825-3e7916518775?w=500&auto=format&fit=crop';
  }

  // ZIP 下载链接
  const zipUrl = project.zip_url ? `${API_BASE_URL}${project.zip_url}` : null;

  // 辅助函数：根据模式显示不同标签
  const getModeLabel = (mode) => {
    if (mode === 'minigs2') return <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30 flex items-center gap-1"><Zap size={10} fill="currentColor"/> 迷你GS</span>;
    return <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">标准</span>;
  };

  return (
    <div 
      onClick={() => !isProcessing && onClick(project)}
      className={`group relative aspect-square rounded-2xl overflow-hidden bg-gray-900 border border-white/5 transition-all duration-300 ${!isProcessing ? 'hover:shadow-2xl hover:shadow-blue-900/20 hover:-translate-y-1' : ''}`}
    >
      {/* 删除按钮 Delete Button (鼠标悬停时可见 Visible on Hover) */}
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(project); }}
        className="absolute top-3 right-3 z-30 p-2 bg-black/50 hover:bg-red-500/80 text-white/70 hover:text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 scale-90 hover:scale-100"
        title="删除项目"
      >
        <Trash2 size={14} />
      </button>

      {/* 模式标签 (左上角) */}
      <div className="absolute top-3 left-3 z-30 opacity-80">
         {getModeLabel(project.mode)}
      </div>

      {/* 处理中状态的遮罩层 Processing state overlay */}
      {isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gray-900/90 backdrop-blur-sm z-20 animate-in fade-in duration-500">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
          <h3 className="text-white font-medium truncate w-full">{project.scene}</h3>
          <span className="text-xs text-blue-400 font-mono mt-2 mb-4 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
            {project.stage || "初始化中..."}
          </span>
          
          {/* 动画进度条 */}
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 w-1/3 animate-[shimmer_2s_infinite_linear]" />
          </div>
          
          {/* 查看日志按钮 */}
          <div className="flex gap-2 mt-6 opacity-60 hover:opacity-100 transition-opacity">
             <button 
                onClick={(e) => { e.stopPropagation(); onViewLogs(project); }}
                className="text-xs flex items-center gap-1 text-gray-300 hover:text-white bg-white/10 px-3 py-1.5 rounded-full cursor-pointer"
             >
                <Terminal size={12} /> 查看日志
             </button>
          </div>
        </div>
      )}

      {/* 完成或失败状态的视图 */}
      {!isProcessing && (
        <>
          {/* 封面图片或默认背景 */}
          {coverUrl ? (
            <img src={coverUrl} alt="cover" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
              <Cuboid size={64} className="text-white/5 group-hover:text-white/10 transition-colors" strokeWidth={1} />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity pointer-events-none" />
          
          <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-2 group-hover:translate-y-0 transition-transform duration-300 z-10">
            <h3 className="text-white font-bold text-lg truncate drop-shadow-md">{project.scene}</h3>
            {/* 悬停时显示的操作按钮 */}
            <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                {/* 下载ZIP按钮 */}
                {zipUrl && (
                    <a 
                        href={zipUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors" 
                        title="下载ZIP"
                    >
                        <Download size={16} />
                    </a>
                )}
                {/* 查看日志按钮 */}
                <button 
                    onClick={(e) => { e.stopPropagation(); onViewLogs(project) }}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors"
                    title="查看日志"
                >
                    <Terminal size={16} />
                </button>
                {/* 状态标签：fail或ready */}
                {isFailed ? (
                    <span className="text-red-400 text-xs font-bold ml-auto flex items-center gap-1.5 bg-red-500/10 px-2 py-1 rounded-full border border-red-500/20">
                        失败
                    </span>
                ) : (
                    <span className="text-green-400 text-xs font-bold ml-auto flex items-center gap-1.5 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">
                        <CheckCircle size={12} />
                        就绪
                    </span>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};



// 日志查看模态框组件
const LogModal = ({ isOpen, onClose, project }) => {
    const [logs, setLogs] = useState([]);
    const logEndRef = useRef(null);

    // Effect：当模态框打开且有项目时，定期获取日志
    useEffect(() => {
        if (!isOpen || !project?.log_url) return;
        const fetchLogs = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}${project.log_url}`);
                if (res.ok) {
                    const text = await res.text();
                    setLogs(text.split('\n'));
                }
            } catch (e) {
                console.error("Failed to fetch logs", e);
            }
        };
        fetchLogs();
        const interval = setInterval(fetchLogs, 2000);
        return () => clearInterval(interval);
    }, [isOpen, project]);

    useEffect(() => {
        if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    if (!isOpen || !project) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-[#0a0a0a] border border-white/10 w-full max-w-3xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-4 border-b border-white/5 bg-[#111]">
                    <h3 className="text-white font-mono flex items-center gap-2 text-sm">
                        <Terminal size={16} className="text-blue-400"/> 
                        构建日志: {project.scene}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
                </div>
                <div className="flex-1 p-6 overflow-y-auto font-mono text-xs text-gray-300 bg-[#050505] space-y-1.5 shadow-inner">
                    {logs.length > 0 ? (
                        logs.map((line, i) => (
                            <div key={i} className="flex gap-3 hover:bg-white/5 py-0.5 px-2 rounded transition-colors group border-l-2 border-transparent hover:border-blue-500">
                                <span className="text-gray-700 select-none w-8 text-right group-hover:text-gray-500 transition-colors">{i+1}</span>
                                <span className="break-all">{line}</span>
                            </div>
                        ))
                    ) : (
                        <div className="text-gray-500 italic flex flex-col items-center justify-center h-full">
                            <Loader2 className="animate-spin mb-2" />
                            等待日志...
                        </div>
                    )}
                    <div ref={logEndRef} />
                </div>
            </div>
        </div>
    )
}

// 创建新项目模态框组件 Create New Project Modal
const CreateModal = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [uploadType, setUploadType] = useState('files');
  const [files, setFiles] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // 状态现在可以是 'idle', '3dgs' (loading), 'minigs2' (loading)
  const [loadingMode, setLoadingMode] = useState(null); 

  if (!isOpen) return null;

  // 修改：不再是单一的 handleSubmit，而是通过点击不同按钮触发不同模式
  const handleModeSubmit = async (mode) => {
    if (!name || !files) return;
    
    setLoadingMode(mode);
    await onSubmit(name, files, uploadType, mode); // 传递 mode 参数
    setLoadingMode(null);
    
    setName('');
    setFiles(null);
  };

  // 拖拽文件放下时的处理函数
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        setFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold text-white">新建重建</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        
        {/* 这里去掉了 <form> 标签，改用 div 布局，因为我们有两个提交按钮 */}
        <div className="space-y-6">
          {/* 场景名称输入框 */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">场景名称</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：我的办公室扫描" className="w-full bg-black/50 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-gray-600" autoFocus />
          </div>
          
          
          {/* 输入格式选择 */}
          <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">输入格式</label>
              <div className="grid grid-cols-3 gap-3">
                  {[{id: 'files', name: '文件'}, {id: 'folder', name: '文件夹'}, {id: 'zip', name: '压缩包'}].map((type) => (
                      <button key={type.id} type="button" onClick={() => setUploadType(type.id)} className={`flex flex-col items-center justify-center py-3 rounded-xl border transition-all duration-200 ${uploadType === type.id ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/50' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white'}`}>
                          {type.id === 'files' && <ImageIcon size={20} className="mb-1.5"/>}
                          {type.id === 'folder' && <Folder size={20} className="mb-1.5"/>}
                          {type.id === 'zip' && <FileArchive size={20} className="mb-1.5"/>}
                          <span className="text-[10px] font-bold uppercase tracking-wide">{type.name}</span>
                      </button>
                  ))}
              </div>
          </div>
          

          {/* 文件上传区域 (支持拖拽) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">源数据</label>
            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${isDragging ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
              <input type="file" multiple={uploadType !== 'zip'} webkitdirectory={uploadType === 'folder' ? "" : undefined} accept={uploadType === 'zip' ? ".zip" : "image/*"} onChange={(e) => setFiles(e.target.files)} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                <div className={`p-4 rounded-full mb-3 transition-colors ${files ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400'}`}>
                    {files ? <CheckCircle size={24} /> : <Upload size={24} />}
                </div>
                <p className="text-sm text-white font-medium mb-1">{files ? `${files.length} 个文件已就绪` : "点击浏览或拖拽文件到此处"}</p>
                <p className="text-xs text-gray-500">{uploadType === 'zip' ? '需要 .zip 压缩包' : '支持 JPG, PNG'}</p>
              </label>
            </div>
          </div>
          

          {/* 提交按钮组 - 此处改为两个按钮 */}
          <div className="grid grid-cols-2 gap-4 pt-2">
             {/* 按钮 1: 普通重建 (3DGS) */}
             <button 
                type="button"
                onClick={() => handleModeSubmit('3dgs')}
                disabled={!name || !files || !!loadingMode} 
                className="bg-[#1a1a1a] border border-white/10 hover:bg-[#252525] hover:border-blue-500/50 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none flex flex-col items-center justify-center gap-1 group"
            >
                {loadingMode === '3dgs' ? (
                    <Loader2 className="animate-spin text-blue-500" />
                ) : (
                    <>
                        <div className="flex items-center gap-2 text-blue-400">
                            <Box size={18} />
                            <span>标准重建</span>
                        </div>
                        <span className="text-[10px] font-normal text-gray-500 group-hover:text-gray-400">3DGS</span>
                    </>
                )}
             </button>

             {/* 按钮 2: 快速重建 (MiniGS2) */}
             <button 
                type="button"
                onClick={() => handleModeSubmit('minigs2')}
                disabled={!name || !files || !!loadingMode} 
                className="bg-gradient-to-br from-purple-900/50 to-pink-900/30 border border-purple-500/30 hover:border-purple-400 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none flex flex-col items-center justify-center gap-1 hover:shadow-lg hover:shadow-purple-900/20 group"
            >
                {loadingMode === 'minigs2' ? (
                    <Loader2 className="animate-spin text-purple-300" />
                ) : (
                    <>
                        <div className="flex items-center gap-2 text-purple-300">
                            <Zap size={18} fill="currentColor" className="text-purple-400" />
                            <span>快速重建</span>
                        </div>
                        <span className="text-[10px] font-normal text-purple-200/60 group-hover:text-purple-200">MiniGS2</span>
                    </>
                )}
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};





// --- 主应用组件 ---

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingLogsFor, setViewingLogsFor] = useState(null);
  const [projects, setProjects] = useState([]);

  // 初始加载: 从服务器获取已有的项目列表
  useEffect(() => {
      const fetchProjects = async () => {
          try {
              const res = await fetch(`${API_BASE_URL}/projects`);
              if (res.ok) {
                  const data = await res.json();
                  setProjects(data);
              }
          } catch (e) {
              console.error("Failed to load projects", e);
          }
      };
      fetchProjects();
  }, []);

  // 2. Polling: 定期更新正在运行的任务的状态
  useEffect(() => {
    const interval = setInterval(() => {
      setProjects(currentProjects => {
        // 如果没有项目，则不执行任何操作
        if (currentProjects.length === 0) return currentProjects;

        // 只检查未完成且未失败的项目
        const activeProjects = currentProjects.filter(p => !p.done && p.status !== 'failed');
        
        if (activeProjects.length === 0) return currentProjects;

        const updatedProjects = [...currentProjects];
        
        activeProjects.forEach(proj => {
             fetch(`${API_BASE_URL}/result/${proj.job_id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) return; 

                    const idx = updatedProjects.findIndex(p => p.job_id === proj.job_id);
                    if (idx !== -1) {
                        updatedProjects[idx] = { ...updatedProjects[idx], ...data };
                        
                        setProjects([...updatedProjects]); 
                    }
                })
                .catch(err => console.error("Poll failed", err));
        });
        
        return currentProjects; 
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);



// --- 事件处理函数 -

  // 修改：添加了 'mode' 参数 ('3dgs' 或 'minigs2')
  const handleCreateProject = async (name, files, uploadType, mode) => {
    const formData = new FormData();
    formData.append("scene_name", name);
    formData.append("upload_type", uploadType);
    formData.append("mode", mode); // 新增：发送选择的模式到后台
    for (let i = 0; i < files.length; i++) formData.append("files", files[i]);

    try {
        // 发送 POST 请求到后端
        const response = await fetch(`${API_BASE_URL}/reconstruct_stream`, { method: 'POST', body: formData });
        if (!response.ok) { alert("上传失败: " + response.statusText); return; }
        const data = await response.json();
        
        // 根据后端返回的数据创建一个新的项目对象
        const newProject = {
            job_id: data.job_id,
            scene: data.scene,
            upload_type: data.upload_type,
            mode: mode, // 记录该项目的模式，用于在卡片上显示
            log_url: data.log_url,
            status_url: data.status_url,
            done: false,
            stage: "已上传",
            // 移除 thumbnail 字段
        };
        setProjects(prev => [newProject, ...prev]);
        setIsModalOpen(false);
    } catch (error) {
        console.error("Creation failed", error);
        alert("连接后端时出错");
    }
  };

  // 处理删除项目
  const handleDeleteProject = async (project) => {
      if (!confirm(`您确定要删除 "${project.scene}" 吗？此操作无法撤销。`)) return;

     
      setProjects(prev => prev.filter(p => p.job_id !== project.job_id));
      
      try { await fetch(`${API_BASE_URL}/delete/${project.job_id}`, { method: 'DELETE' }); } catch (e) {}
  };

  // 处理查看3D视图的逻辑
  const handleView3D = async (project) => {
      try {
          const res = await fetch(`${API_BASE_URL}/viewer/${project.job_id}`);
          if (!res.ok) throw new Error("查看器未准备好");
          const data = await res.json();
          if (data.editor_url) {
              window.open(data.editor_url, '_blank');
          } else {
              alert("未找到编辑器URL。重建可能未完成。");
          }
      } catch (e) {
          alert("无法打开查看器: " + e.message);
      }
  };

  // --- 渲染 JSX ---
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 pb-20">
      <Navbar onCreateClick={() => setIsModalOpen(true)} />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-10 border-b border-white/10 pb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">我的采集</h1>
                <p className="text-gray-400">管理与查看3D高斯溅射重建项目。</p>
            </div>
            <div className="flex gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-xs font-mono font-bold">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
                    后端: 在线
                </div>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            <button onClick={() => setIsModalOpen(true)} className="aspect-square rounded-2xl border-2 border-dashed border-gray-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex flex-col items-center justify-center text-gray-600 hover:text-blue-400 group animate-in zoom-in-50 duration-300">
                <div className="w-16 h-16 rounded-full bg-[#111] group-hover:bg-blue-500/20 flex items-center justify-center mb-4 transition-colors shadow-xl"><Plus size={32} /></div>
                <span className="font-bold text-lg">新场景</span>
            </button>

            {projects.map((project) => (
              <div key={project.job_id} className="animate-in zoom-in-50 duration-500">
                <ProjectCard 
                    project={project} 
                    onClick={handleView3D}
                    onViewLogs={setViewingLogsFor}
                    onDelete={handleDeleteProject}
                />
              </div>
            ))}
        </div>
      </main>
      <CreateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateProject} />
      <LogModal isOpen={!!viewingLogsFor} onClose={() => setViewingLogsFor(null)} project={viewingLogsFor} />
    </div>
  );
}