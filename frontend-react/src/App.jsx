import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, User, Menu, Upload, X, Loader2, Play, FileArchive, 
  Folder, Image as ImageIcon, Terminal, Download, CheckCircle, AlertCircle, Trash2 
} from 'lucide-react';

// --- Configuration ---
const API_BASE_URL = ""; 

// --- Components ---

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
        <span>Create</span>
      </button>
    </div>
  </nav>
);

const ProjectCard = ({ project, onClick, onViewLogs, onDelete }) => {
  const isProcessing = !project.done && project.status !== 'failed';
  const isFailed = project.status === 'failed';
  
  const thumbUrl = project.thumbnail || "https://via.placeholder.com/400/111/333?text=Processing";
  const zipUrl = project.zip_url ? `${API_BASE_URL}${project.zip_url}` : null;

  return (
    <div 
      className={`group relative aspect-square rounded-2xl overflow-hidden bg-gray-900 border border-white/5 transition-all duration-300 ${!isProcessing ? 'hover:shadow-2xl hover:shadow-blue-900/20 hover:-translate-y-1' : ''}`}
    >
      {/* Delete Button (Visible on Hover) */}
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(project); }}
        className="absolute top-3 right-3 z-30 p-2 bg-black/50 hover:bg-red-500/80 text-white/70 hover:text-white rounded-full backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 scale-90 hover:scale-100"
        title="Delete Project"
      >
        <Trash2 size={14} />
      </button>

      {/* Processing State Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gray-900/90 backdrop-blur-sm z-20 animate-in fade-in duration-500">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
          <h3 className="text-white font-medium truncate w-full">{project.scene}</h3>
          <span className="text-xs text-blue-400 font-mono mt-2 mb-4 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
            {project.stage || "Initializing..."}
          </span>
          
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 w-1/3 animate-[shimmer_2s_infinite_linear]" />
          </div>
          
          <div className="flex gap-2 mt-6 opacity-60 hover:opacity-100 transition-opacity">
             <button 
                onClick={(e) => { e.stopPropagation(); onViewLogs(project); }}
                className="text-xs flex items-center gap-1 text-gray-300 hover:text-white bg-white/10 px-3 py-1.5 rounded-full cursor-pointer"
             >
                <Terminal size={12} /> View Logs
             </button>
          </div>
        </div>
      )}

      {/* Completed/Failed State */}
      {!isProcessing && (
        <>
          <img 
            src={thumbUrl} 
            alt={project.scene}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity pointer-events-none" />
          
          <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-2 group-hover:translate-y-0 transition-transform duration-300 z-10">
            <h3 className="text-white font-bold text-lg truncate drop-shadow-md">{project.scene}</h3>
            
            <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                {zipUrl && (
                    <a 
                        href={zipUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors" 
                        title="Download ZIP"
                    >
                        <Download size={16} />
                    </a>
                )}
                <button 
                    onClick={(e) => { e.stopPropagation(); onViewLogs(project) }}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors"
                    title="View Logs"
                >
                    <Terminal size={16} />
                </button>
                
                {isFailed ? (
                    <span className="text-red-400 text-xs font-bold ml-auto flex items-center gap-1.5 bg-red-500/10 px-2 py-1 rounded-full border border-red-500/20">
                        Failed
                    </span>
                ) : (
                    <span className="text-green-400 text-xs font-bold ml-auto flex items-center gap-1.5 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">
                        <CheckCircle size={12} />
                        Ready
                    </span>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const LogModal = ({ isOpen, onClose, project }) => {
    const [logs, setLogs] = useState([]);
    const logEndRef = useRef(null);

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
                        Build Logs: {project.scene}
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
                            Waiting for logs...
                        </div>
                    )}
                    <div ref={logEndRef} />
                </div>
            </div>
        </div>
    )
}

const CreateModal = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [uploadType, setUploadType] = useState('files');
  const [files, setFiles] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !files) return;
    setIsLoading(true);
    await onSubmit(name, files, uploadType);
    setIsLoading(false);
    setName('');
    setFiles(null);
  };

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
          <h2 className="text-xl font-bold text-white">New Reconstruction</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">Scene Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Office Scan" className="w-full bg-black/50 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-gray-600" autoFocus />
          </div>
          <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">Input Format</label>
              <div className="grid grid-cols-3 gap-3">
                  {['files', 'folder', 'zip'].map((type) => (
                      <button key={type} type="button" onClick={() => setUploadType(type)} className={`flex flex-col items-center justify-center py-3 rounded-xl border transition-all duration-200 ${uploadType === type ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/50' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white'}`}>
                          {type === 'files' && <ImageIcon size={20} className="mb-1.5"/>}
                          {type === 'folder' && <Folder size={20} className="mb-1.5"/>}
                          {type === 'zip' && <FileArchive size={20} className="mb-1.5"/>}
                          <span className="text-[10px] font-bold uppercase tracking-wide">{type}</span>
                      </button>
                  ))}
              </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">Source Data</label>
            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${isDragging ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
              <input type="file" multiple={uploadType !== 'zip'} webkitdirectory={uploadType === 'folder' ? "" : undefined} accept={uploadType === 'zip' ? ".zip" : "image/*"} onChange={(e) => setFiles(e.target.files)} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                <div className={`p-4 rounded-full mb-3 transition-colors ${files ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400'}`}>
                    {files ? <CheckCircle size={24} /> : <Upload size={24} />}
                </div>
                <p className="text-sm text-white font-medium mb-1">{files ? `${files.length} file(s) ready` : "Click to browse or drop here"}</p>
                <p className="text-xs text-gray-500">{uploadType === 'zip' ? 'Requires .zip archive' : 'Supports JPG, PNG'}</p>
              </label>
            </div>
          </div>
          <button type="submit" disabled={!name || !files || isLoading} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-blue-600/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
            {isLoading ? <Loader2 className="animate-spin" /> : "Start Reconstruction"}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- Main Application ---

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingLogsFor, setViewingLogsFor] = useState(null);
  const [projects, setProjects] = useState([]);

  // Load Projects
  useEffect(() => {
    const saved = localStorage.getItem("gs_projects");
    if (saved) setProjects(JSON.parse(saved));
  }, []);

  // Save Projects
  useEffect(() => {
    localStorage.setItem("gs_projects", JSON.stringify(projects));
  }, [projects]);

  // Poll Backend
  useEffect(() => {
    const interval = setInterval(() => {
      setProjects(currentProjects => {
        return currentProjects.map(proj => {
          if (!proj.done && proj.status !== 'failed') {
             fetch(`${API_BASE_URL}/result/${proj.job_id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) return; 
                    setProjects(prev => prev.map(p => p.job_id === proj.job_id ? { ...p, ...data } : p));
                })
                .catch(err => console.error("Poll failed", err));
          }
          return proj;
        });
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateProject = async (name, files, uploadType) => {
    const formData = new FormData();
    formData.append("scene_name", name);
    formData.append("upload_type", uploadType);
    for (let i = 0; i < files.length; i++) formData.append("files", files[i]);

    try {
        const response = await fetch(`${API_BASE_URL}/reconstruct_stream`, { method: 'POST', body: formData });
        if (!response.ok) { alert("Upload failed: " + response.statusText); return; }
        const data = await response.json();
        
        const newProject = {
            job_id: data.job_id,
            scene: data.scene,
            upload_type: data.upload_type,
            log_url: data.log_url,
            status_url: data.status_url,
            done: false,
            stage: "Uploaded",
            thumbnail: "https://images.unsplash.com/photo-1621569898825-3e7916518775?w=500&auto=format&fit=crop", 
        };
        setProjects(prev => [newProject, ...prev]);
        setIsModalOpen(false);
    } catch (error) {
        console.error("Creation failed", error);
        alert("Error connecting to backend");
    }
  };

  // --- DELETE FUNCTION ---
  const handleDeleteProject = async (project) => {
      if (!confirm(`Are you sure you want to delete "${project.scene}"? This cannot be undone.`)) return;

      // 1. Optimistically remove from UI
      setProjects(prev => prev.filter(p => p.job_id !== project.job_id));

      // 2. Call Backend to delete files
      try {
          await fetch(`${API_BASE_URL}/delete/${project.job_id}`, { method: 'DELETE' });
      } catch (e) {
          console.error("Delete failed on server", e);
          // Optional: Add it back if server failed? usually not needed for this use case
      }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 pb-20">
      <Navbar onCreateClick={() => setIsModalOpen(true)} />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-10 border-b border-white/10 pb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">My Captures</h1>
                <p className="text-gray-400">Manage and view your Gaussian Splatting reconstructions.</p>
            </div>
            <div className="flex gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-xs font-mono font-bold">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
                    Backend: ONLINE
                </div>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            <button onClick={() => setIsModalOpen(true)} className="aspect-square rounded-2xl border-2 border-dashed border-gray-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex flex-col items-center justify-center text-gray-600 hover:text-blue-400 group animate-in zoom-in-50 duration-300">
                <div className="w-16 h-16 rounded-full bg-[#111] group-hover:bg-blue-500/20 flex items-center justify-center mb-4 transition-colors shadow-xl"><Plus size={32} /></div>
                <span className="font-bold text-lg">New Scene</span>
            </button>

            {projects.map((project) => (
              <div key={project.job_id} className="animate-in zoom-in-50 duration-500">
                <ProjectCard 
                    project={project} 
                    onClick={() => {}}
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