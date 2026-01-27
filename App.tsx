
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Download, FileCheck, Save, Printer, LogOut, User as UserIcon, 
  CloudUpload, Loader2, History, X, Trash2, FilePlus, 
  CheckCircle2, Search, Factory, ChevronRight, ArrowLeft, LayoutList,
  RotateCcw, AlertCircle
} from 'lucide-react';
import { ChecklistItem, FormData, SignatureData, User } from './types';
import { INITIAL_CHECKLIST_ITEMS } from './constants';
import SignatureCanvas from './components/SignatureCanvas';
import Auth from './components/Auth';
import { supabase } from './lib/supabase';

// For generating PDF in the browser environment
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type AppTab = 'editor' | 'archive';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('editor');
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedLineFilter, setSelectedLineFilter] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    date: new Date().toISOString().split('T')[0],
    line: '',
    startTime: '',
    endTime: '',
    currentProduct: '',
    setupProduct: '',
    actingArea: 'Engenharia Industrial',
    lineLeader: '',
    responsible: '',
    monitor: '',
  });

  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST_ITEMS);
  const [signatures, setSignatures] = useState<SignatureData>({});
  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Monitor Supabase Auth Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata.full_name || session.user.email?.split('@')[0] || 'Usuário',
          username: session.user.email || ''
        });
        setFormData(prev => ({ ...prev, responsible: session.user.user_metadata.full_name || prev.responsible }));
      }
      setIsInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: session.user.user_metadata.full_name || session.user.email?.split('@')[0] || 'Usuário',
          username: session.user.email || ''
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && activeTab === 'archive') {
      fetchHistory();
    }
  }, [user, activeTab]);

  const handleLogin = (loggedUser: User) => {
    setUser(loggedUser);
    setFormData(prev => ({ ...prev, responsible: loggedUser.name }));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleChecklistChange = (id: number, field: keyof ChecklistItem, value: string) => {
    setChecklist(prev => 
      prev.map(item => item.id === id ? { ...item, [field]: value } : item)
    );
  };

  const handleSignatureSave = (role: 'leader' | 'monitor', dataUrl: string) => {
    setSignatures(prev => ({
      ...prev,
      [role === 'leader' ? 'leaderSignature' : 'monitorSignature']: dataUrl
    }));
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      // Nota: O RLS no Supabase garantirá que apenas dados permitidos sejam retornados
      const { data, error } = await supabase
        .from('checklists')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setHistoryItems(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const resetForm = () => {
    if (!confirm('Deseja limpar todos os campos e iniciar um novo checklist?')) return;
    setFormData({
      date: new Date().toISOString().split('T')[0],
      line: '',
      startTime: '',
      endTime: '',
      currentProduct: '',
      setupProduct: '',
      actingArea: 'Engenharia Industrial',
      lineLeader: '',
      responsible: user?.name || '',
      monitor: '',
    });
    setChecklist(INITIAL_CHECKLIST_ITEMS);
    setSignatures({});
    setSaveSuccess(false);
  };

  const loadChecklist = (item: any) => {
    setFormData(item.form_data);
    setChecklist(item.checklist_items);
    setSignatures(item.signatures || {});
    setActiveTab('editor');
    setSaveSuccess(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteFromHistory = async (e: React.MouseEvent, id: string, creatorId: string) => {
    e.stopPropagation();
    
    // Verificação defensiva no cliente: Apenas o criador pode deletar
    if (user?.id !== creatorId) {
      alert('Segurança: Você só pode excluir checklists criados por você mesmo.');
      return;
    }

    if (!confirm('Deseja realmente excluir este checklist permanentemente?')) return;
    
    try {
      // Reforçamos o filtro user_id para garantir que o RLS tenha uma camada extra de proteção
      const { error } = await supabase
        .from('checklists')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      setHistoryItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir checklist. Verifique suas permissões.');
    }
  };

  const saveToSupabase = async () => {
    if (!user) return;
    if (!formData.line.trim()) {
      alert("Por favor, identifique a LINHA antes de salvar.");
      return;
    }
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const { error } = await supabase
        .from('checklists')
        .insert([
          {
            user_id: user.id, // O user_id é essencial para o RLS funcionar
            form_data: formData,
            checklist_items: checklist,
            signatures: signatures,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchHistory();
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar no banco. Verifique sua conexão e permissões RLS.');
    } finally {
      setIsSaving(false);
    }
  };

  const exportPDF = async () => {
    if (!printRef.current) return;
    setIsExporting(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1000, 
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      pdf.save(`Checklist_Setup_${formData.line || 'FI_12_70'}_${formData.date}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Erro ao gerar PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  // Groups and filtered data for the archive
  const uniqueLines = useMemo(() => {
    const lines = historyItems.map(item => item.form_data.line).filter(Boolean);
    return Array.from(new Set(lines)).sort();
  }, [historyItems]);

  const filteredHistory = useMemo(() => {
    if (!selectedLineFilter) return historyItems;
    return historyItems.filter(item => item.form_data.line === selectedLineFilter);
  }, [historyItems, selectedLineFilter]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-[#004a99]" size={48} />
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header & Main Navigation */}
      <header className="no-print mb-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-[#004a99] p-3 rounded-2xl text-white shadow-xl rotate-3">
              <FileCheck size={36} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none mb-1 uppercase">Setup Digital</h1>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Grupo Multi • Engenharia Industrial</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#004a99]">
                   <UserIcon size={16} />
                </div>
                <div className="flex flex-col">
                   <span className="text-xs font-black text-gray-800 uppercase leading-none">{user.name}</span>
                   <span className="text-[10px] text-gray-400 font-bold">Monitor Online</span>
                </div>
                <button onClick={handleLogout} className="ml-2 text-gray-400 hover:text-red-500 transition-colors">
                   <LogOut size={18} />
                </button>
             </div>
          </div>
        </div>

        {/* Tab Switching */}
        <div className="flex p-1 bg-gray-200/50 rounded-2xl w-full max-w-md mx-auto shadow-inner border border-gray-200">
           <button 
             onClick={() => setActiveTab('editor')}
             className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${activeTab === 'editor' ? 'bg-white text-[#004a99] shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
           >
              <FilePlus size={16} /> Novo Setup
           </button>
           <button 
             onClick={() => setActiveTab('archive')}
             className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${activeTab === 'archive' ? 'bg-white text-[#004a99] shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
           >
              <Factory size={16} /> Arquivo por Linha
           </button>
        </div>
      </header>

      {/* Editor Tab Content */}
      {activeTab === 'editor' && (
        <main className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-end gap-3 mb-6 no-print">
            <button
              onClick={resetForm}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-black rounded-xl transition-all text-xs shadow-sm hover:border-blue-400"
            >
              <RotateCcw size={16} className="text-blue-500" /> Reiniciar Campos
            </button>
            
            <button
              onClick={saveToSupabase}
              disabled={isSaving}
              className={`flex items-center gap-2 px-5 py-2.5 ${
                saveSuccess ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'
              } font-black rounded-xl transition-all shadow-lg disabled:bg-gray-400 text-xs uppercase tracking-tighter`}
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={18} /> : <CloudUpload size={18} />}
              {saveSuccess ? 'Checklist Salvo!' : 'Salvar na Nuvem'}
            </button>

            <button
              onClick={exportPDF}
              disabled={isExporting}
              className={`flex items-center gap-2 px-6 py-2.5 ${
                isExporting ? 'bg-blue-400' : 'bg-[#004a99] hover:bg-[#003366]'
              } text-white font-black rounded-xl shadow-lg transition-all text-xs uppercase tracking-tighter`}
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download size={18} />
              )}
              Baixar Documento PDF
            </button>
          </div>

          <div 
            ref={printRef}
            className="bg-white border-[2px] border-black text-black overflow-hidden shadow-2xl mb-12 mx-auto"
            style={{ width: '100%', maxWidth: '1000px' }}
          >
            {/* FI 12 70 Header */}
            <div className="grid grid-cols-12 border-b-[2px] border-black">
              <div className="col-span-3 p-4 flex items-center justify-center border-r-[2px] border-black">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[#89b4e1] text-2xl font-normal lowercase tracking-tighter">grupo</span>
                  <span className="text-[#004a99] text-3xl font-bold lowercase tracking-tighter">multi</span>
                </div>
              </div>
              <div className="col-span-6 grid grid-rows-2 border-r-[2px] border-black font-bold">
                <div className="grid grid-cols-2 h-full border-b-[2px] border-black">
                  <div className="px-3 py-2 border-r-[2px] border-black flex items-center text-[10px]">Data Emissão: 16/10/2024</div>
                  <div className="px-3 py-2 flex items-center text-[10px]">Revisão: 02 - 15/04/2025</div>
                </div>
                <div className="grid grid-cols-2 h-full">
                  <div className="px-3 py-2 border-r-[2px] border-black flex items-center text-[10px]">Elaborado: RENATO MIRANDA</div>
                  <div className="px-3 py-2 flex items-center text-[10px]">Aprovado: Helton Giacomini</div>
                </div>
              </div>
              <div className="col-span-3 flex items-center justify-center bg-gray-50">
                <span className="text-3xl font-black italic tracking-tighter">FI 12 70</span>
              </div>
            </div>

            <div className="py-3 border-b-[2px] border-black text-center">
              <h2 className="text-2xl font-black uppercase tracking-[0.2em]">Check List Setup</h2>
            </div>

            <div className="bg-[#dcdcdc] py-1.5 font-black text-xs uppercase border-b-[2px] border-black tracking-widest text-center">Dados Gerais</div>
            <div className="grid grid-cols-12 border-b-[2px] border-black">
              <div className="col-span-4 p-2.5 border-r-[2px] border-black flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Data:</label>
                <input type="date" name="date" value={formData.date} onChange={handleFormChange} className="text-xs font-bold bg-transparent flex-1 outline-none" />
              </div>
              <div className="col-span-4 p-2.5 border-r-[2px] border-black flex items-center gap-2">
                <label className="text-[11px] font-black uppercase text-red-600">Linha:</label>
                <input type="text" name="line" value={formData.line} onChange={handleFormChange} placeholder="Identifique a Linha" className="flex-1 text-xs font-bold bg-transparent outline-none placeholder:text-gray-300" />
              </div>
              <div className="col-span-4 p-2.5 flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Hora Início:</label>
                <input type="time" name="startTime" value={formData.startTime} onChange={handleFormChange} className="text-xs font-bold bg-transparent flex-1 outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-12 border-b-[2px] border-black">
              <div className="col-span-4 p-2.5 border-r-[2px] border-black flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Produto Atual:</label>
                <input type="text" name="currentProduct" value={formData.currentProduct} onChange={handleFormChange} className="flex-1 text-xs font-bold bg-transparent outline-none" />
              </div>
              <div className="col-span-4 p-2.5 border-r-[2px] border-black flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Setup Produto:</label>
                <input type="text" name="setupProduct" value={formData.setupProduct} onChange={handleFormChange} className="flex-1 text-xs font-bold bg-transparent outline-none" />
              </div>
              <div className="col-span-4 p-2.5 flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Hora Término:</label>
                <input type="time" name="endTime" value={formData.endTime} onChange={handleFormChange} className="text-xs font-bold bg-transparent flex-1 outline-none" />
              </div>
            </div>

            <div className="bg-[#dcdcdc] py-1.5 font-black text-xs uppercase border-b-[2px] border-black tracking-widest text-center">Responsáveis</div>
            <div className="grid grid-cols-12 border-b-[2px] border-black">
              <div className="col-span-5 p-2.5 border-r-[2px] border-black flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Área:</label>
                <input type="text" name="actingArea" value={formData.actingArea} onChange={handleFormChange} className="flex-1 text-xs font-bold bg-transparent outline-none" />
              </div>
              <div className="col-span-7 p-2.5 flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Líder:</label>
                <input type="text" name="lineLeader" value={formData.lineLeader} onChange={handleFormChange} className="flex-1 text-xs font-bold bg-transparent outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-12 border-b-[2px] border-black">
              <div className="col-span-5 p-2.5 border-r-[2px] border-black flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Responsável:</label>
                <input type="text" name="responsible" value={formData.responsible} onChange={handleFormChange} className="flex-1 text-xs font-bold bg-transparent outline-none" />
              </div>
              <div className="col-span-7 p-2.5 flex items-center gap-2">
                <label className="text-[11px] font-black uppercase">Monitor:</label>
                <input type="text" name="monitor" value={formData.monitor} onChange={handleFormChange} className="flex-1 text-xs font-bold bg-transparent outline-none" />
              </div>
            </div>

            <div className="bg-[#dcdcdc] py-1.5 font-black text-xs uppercase border-b-[2px] border-black tracking-widest text-center">Atividades de Setup</div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-white text-[10px] uppercase font-black border-b-[2px] border-black">
                  <th className="w-10 p-2 border-r-[2px] border-black">#</th>
                  <th className="text-left p-2 border-r-[2px] border-black px-4">ITEM DE VERIFICAÇÃO</th>
                  <th className="w-16 p-2 border-r-[2px] border-black">Qtd</th>
                  <th className="w-24 p-2 border-r-[2px] border-black">Status</th>
                  <th className="p-2 px-4 text-center">OBSERVAÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((item) => (
                  <tr key={item.id} className="border-b-[1px] border-black text-[11px] hover:bg-gray-50 transition-colors">
                    <td className="text-center p-1.5 font-black border-r-[2px] border-black">{item.id}</td>
                    <td className="p-1.5 border-r-[2px] border-black px-4 font-bold">{item.activity}</td>
                    <td className="p-1.5 border-r-[2px] border-black">
                      <input type="text" value={item.quantity} onChange={(e) => handleChecklistChange(item.id, 'quantity', e.target.value)} className="w-full text-center bg-transparent font-black outline-none" />
                    </td>
                    <td className="p-1.5 border-r-[2px] border-black">
                      <select 
                        value={item.status} 
                        onChange={(e) => handleChecklistChange(item.id, 'status', e.target.value as any)} 
                        className={`w-full text-center bg-transparent font-black cursor-pointer outline-none ${item.status === 'OK' ? 'text-green-600' : 'text-black'}`}
                      >
                        <option value="">-</option>
                        <option value="OK">OK</option>
                        <option value="N/A">N/A</option>
                      </select>
                    </td>
                    <td className="p-1.5 px-4 italic text-[10px]">
                      <input type="text" value={item.notes} onChange={(e) => handleChecklistChange(item.id, 'notes', e.target.value)} className="w-full bg-transparent outline-none" placeholder="..." />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="p-10 bg-white border-t-[2px] border-black">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                <SignatureCanvas 
                  label={`Assinatura Líder: ${formData.lineLeader || '---'}`} 
                  onSave={(data) => handleSignatureSave('leader', data)}
                  initialImage={signatures.leaderSignature}
                />
                <SignatureCanvas 
                  label={`Assinatura Monitor: ${formData.monitor || '---'}`} 
                  onSave={(data) => handleSignatureSave('monitor', data)} 
                  initialImage={signatures.monitorSignature}
                />
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Archive Tab Content */}
      {activeTab === 'archive' && (
        <main className="animate-in fade-in slide-in-from-right-4 duration-500">
           <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Sidebar: Line Selection */}
              <div className="lg:col-span-1 space-y-4">
                 <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 overflow-hidden">
                    <h3 className="text-xs font-black uppercase text-gray-400 mb-4 tracking-widest flex items-center gap-2">
                       <LayoutList size={14} /> Selecionar Linha
                    </h3>
                    
                    <div className="space-y-1">
                       <button 
                         onClick={() => setSelectedLineFilter(null)}
                         className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between group ${!selectedLineFilter ? 'bg-[#004a99] text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}
                       >
                          <span>TODAS AS LINHAS</span>
                          <ChevronRight size={14} className={!selectedLineFilter ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} />
                       </button>
                       
                       {uniqueLines.map(line => (
                          <button 
                            key={line}
                            onClick={() => setSelectedLineFilter(line)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between group ${selectedLineFilter === line ? 'bg-[#004a99] text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'}`}
                          >
                             <span className="uppercase">{line}</span>
                             <ChevronRight size={14} className={selectedLineFilter === line ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} />
                          </button>
                       ))}

                       {uniqueLines.length === 0 && !isLoadingHistory && (
                          <p className="text-[10px] text-gray-400 font-medium py-4 text-center">Nenhum registro encontrado.</p>
                       )}
                    </div>
                 </div>

                 <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                    <p className="text-[10px] text-blue-700 font-black uppercase leading-tight flex items-center gap-1">
                      <AlertCircle size={10} /> Segurança RLS Ativa
                    </p>
                    <p className="text-[10px] text-blue-600/70 font-medium mt-1">
                      Você pode visualizar todos os registros, mas apenas o criador de cada checklist pode excluí-lo.
                    </p>
                 </div>
              </div>

              {/* Main: Filtered Checklists */}
              <div className="lg:col-span-3">
                 <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-3">
                       {selectedLineFilter ? `Setup da Linha: ${selectedLineFilter}` : 'Todos os Checklists'}
                       <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-bold">{filteredHistory.length}</span>
                    </h2>
                 </div>

                 {isLoadingHistory ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-3xl border border-dashed border-gray-300">
                       <Loader2 className="animate-spin text-blue-500" size={48} />
                       <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Carregando Arquivos...</p>
                    </div>
                 ) : filteredHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-dashed border-gray-300 text-center px-8">
                       <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-300 mb-4">
                          <History size={32} />
                       </div>
                       <p className="text-gray-500 font-bold uppercase text-xs">Nenhum checklist arquivado para esta linha.</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {filteredHistory.map((item) => (
                          <div 
                            key={item.id} 
                            onClick={() => loadChecklist(item)}
                            className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group relative overflow-hidden"
                          >
                             <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-500" />
                             
                             <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                   <div className="flex flex-col">
                                      <span className="text-[10px] font-black text-[#004a99] uppercase tracking-widest mb-1">Linha {item.form_data.line}</span>
                                      <span className="text-[10px] text-gray-400 font-bold">{new Date(item.created_at).toLocaleString('pt-BR')}</span>
                                   </div>
                                   {user.id === item.user_id && (
                                     <button 
                                       onClick={(e) => deleteFromHistory(e, item.id, item.user_id)}
                                       className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                       title="Excluir seu registro"
                                     >
                                        <Trash2 size={16} />
                                     </button>
                                   )}
                                </div>

                                <div className="space-y-3">
                                   <div>
                                      <p className="text-[10px] font-black text-gray-400 uppercase leading-none mb-1">Produto em Setup</p>
                                      <p className="text-sm font-black text-gray-800 line-clamp-1">{item.form_data.setupProduct || 'N/A'}</p>
                                   </div>
                                   
                                   <div className="flex justify-between items-end border-t border-gray-50 pt-3 mt-3">
                                      <div className="flex items-center gap-2">
                                         <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                                            <UserIcon size={12} />
                                         </div>
                                         <span className="text-[10px] font-bold text-gray-500 uppercase">{item.form_data.responsible}</span>
                                      </div>
                                      <div className="text-[10px] font-black text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform uppercase">
                                         Ver Checklist <ChevronRight size={12} />
                                      </div>
                                   </div>
                                </div>
                             </div>
                          </div>
                       ))}
                    </div>
                 )}
              </div>
           </div>
        </main>
      )}

      <footer className="mt-16 text-center text-gray-300 text-[10px] pb-12 no-print uppercase font-black tracking-[0.4em]">
        Documento Interno • Gerenciamento de Setup • Unidade Industrial
      </footer>
    </div>
  );
};

export default App;
