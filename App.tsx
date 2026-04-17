
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Download, FileCheck, Save, Printer, LogOut, User as UserIcon, 
  CloudUpload, Loader2, History, X, Trash2, FilePlus, 
  CheckCircle2, Search, Factory, ChevronRight, ArrowLeft, LayoutList,
  RotateCcw, AlertCircle, Link as LinkIcon, Copy, RefreshCcw, MessageCircle, Image, Send
} from 'lucide-react';
import { ChecklistItem, ChecklistRecord, FormData, SignatureData, SignatureRequests, SignatureRole, User } from './types';
import { INITIAL_CHECKLIST_ITEMS } from './constants';
import SignatureCanvas from './components/SignatureCanvas';
import Auth from './components/Auth';
import RemoteSignaturePage from './components/RemoteSignaturePage';
import { getBaseUrl, supabase } from './lib/supabase';

// For generating PDF in the browser environment
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type AppTab = 'editor' | 'archive';
const KEEP_ALIVE_STORAGE_KEY = 'checklist_setup:last_keep_alive_at';
const KEEP_ALIVE_INTERVAL_MS = 6 * 60 * 60 * 1000;

const generateSignatureToken = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const emptySignatureRequests = (): SignatureRequests => ({
  leader: { token: '', signedAt: null, signerName: '' },
  monitor: { token: '', signedAt: null, signerName: '' },
});

const normalizeChecklistRecord = (item: ChecklistRecord) => {
  const leaderSignature = item.signatures?.leaderSignature || item.leader_signature || '';
  const monitorSignature = item.signatures?.monitorSignature || item.monitor_signature || '';

  return {
    ...item,
    signatures: {
      leaderSignature,
      monitorSignature,
    },
    signature_requests: {
      ...emptySignatureRequests(),
      ...(item.signature_requests || {}),
      leader: {
        ...emptySignatureRequests().leader,
        ...(item.signature_requests?.leader || {}),
        signedAt: item.signature_requests?.leader?.signedAt || item.leader_signed_at || null,
      },
      monitor: {
        ...emptySignatureRequests().monitor,
        ...(item.signature_requests?.monitor || {}),
        signedAt: item.signature_requests?.monitor?.signedAt || item.monitor_signed_at || null,
      },
    },
  };
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('editor');
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [historyItems, setHistoryItems] = useState<ChecklistRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedLineFilter, setSelectedLineFilter] = useState<string | null>(null);
  const [currentChecklistId, setCurrentChecklistId] = useState<string | null>(null);
  const [signatureRequests, setSignatureRequests] = useState<SignatureRequests>(emptySignatureRequests());
  const [copiedRole, setCopiedRole] = useState<SignatureRole | null>(null);
  const [isRefreshingSignatures, setIsRefreshingSignatures] = useState(false);

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
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isSendingToWhatsApp, setIsSendingToWhatsApp] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const remoteRoleParam = urlParams.get('role');
  const remoteTokenParam = urlParams.get('token');
  const remoteChecklistParam = urlParams.get('checklist');
  const remoteLineParam = urlParams.get('line') || '';
  const remoteProductParam = urlParams.get('product') || '';
  const remoteResponsibleParam = urlParams.get('responsible') || '';
  const remoteSignerParam = urlParams.get('signer') || '';
  const isRemoteSigningView =
    (remoteRoleParam === 'leader' || remoteRoleParam === 'monitor') &&
    typeof remoteChecklistParam === 'string' &&
    remoteChecklistParam.length > 0 &&
    typeof remoteTokenParam === 'string' &&
    remoteTokenParam.length > 0;

  const keepSupabaseAlive = useCallback(async (force = false) => {
    if (!user || typeof window === 'undefined') return;

    const now = Date.now();
    const storedLastRun = Number(window.localStorage.getItem(KEEP_ALIVE_STORAGE_KEY) || '0');
    const hasRecentPing = Number.isFinite(storedLastRun) && now - storedLastRun < KEEP_ALIVE_INTERVAL_MS;

    if (!force && hasRecentPing) return;
    if (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    try {
      const { error } = await supabase
        .from('checklists')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      if (error) {
        console.warn('Keep-alive Supabase falhou:', error.message);
        return;
      }

      window.localStorage.setItem(KEEP_ALIVE_STORAGE_KEY, String(now));
    } catch (err) {
      console.warn('Erro inesperado no keep-alive:', err);
    }
  }, [user]);

  // Monitor Supabase Auth Session
  useEffect(() => {
    // Timeout de segurança: se em 5 segundos o Supabase não responder, libera a tela
    const timeout = setTimeout(() => {
      if (isInitializing) setIsInitializing(false);
    }, 5000);

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
      clearTimeout(timeout);
    }).catch(err => {
      console.error("Erro na conexão inicial com Supabase:", err);
      setIsInitializing(false);
      clearTimeout(timeout);
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

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (user && activeTab === 'archive') {
      fetchHistory();
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (!user || isRemoteSigningView) return;

    keepSupabaseAlive(true);

    const intervalId = window.setInterval(() => {
      keepSupabaseAlive(false);
    }, 5 * 60 * 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        keepSupabaseAlive(false);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isRemoteSigningView, keepSupabaseAlive, user]);

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

    setSignatureRequests(prev => ({
      ...prev,
      [role]: {
        ...(prev[role] || {}),
        signedAt: dataUrl ? new Date().toISOString() : null,
      }
    }));
  };

  const buildSignatureLink = (role: SignatureRole, token?: string, checklistId?: string) => {
    if (!token || !checklistId) return '';

    const params = new URLSearchParams({
      role,
      token,
      checklist: checklistId,
      line: formData.line || '',
      product: formData.setupProduct || '',
      responsible: formData.responsible || '',
      signer: role === 'leader' ? formData.lineLeader || '' : formData.monitor || '',
    });

    return `${getBaseUrl()}?${params.toString()}`;
  };

  const refreshChecklistFromDatabase = useCallback(async (checklistId: string, silent = false) => {
    if (!silent) {
      setIsRefreshingSignatures(true);
    }

    try {
      const { data, error } = await supabase
        .from('checklists')
        .select('*')
        .eq('id', checklistId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      const normalized = normalizeChecklistRecord(data as ChecklistRecord);

      setCurrentChecklistId(normalized.id);
      setFormData(normalized.form_data);
      setChecklist(normalized.checklist_items);
      setSignatures(normalized.signatures || {});
      setSignatureRequests(normalized.signature_requests || emptySignatureRequests());
    } catch (err) {
      console.error('Erro ao atualizar checklist:', err);
    } finally {
      if (!silent) {
        setIsRefreshingSignatures(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!currentChecklistId || activeTab !== 'editor') return;

    const hasPendingRemoteSignature = (['leader', 'monitor'] as SignatureRole[]).some((role) => {
      const request = signatureRequests[role];
      const signed = role === 'leader' ? signatures.leaderSignature : signatures.monitorSignature;
      return Boolean(request?.token && !request?.signedAt && !signed);
    });

    if (!hasPendingRemoteSignature) return;

    const intervalId = window.setInterval(() => {
      refreshChecklistFromDatabase(currentChecklistId, true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activeTab, currentChecklistId, refreshChecklistFromDatabase, signatureRequests, signatures]);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('checklists')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setHistoryItems((data || []).map(item => normalizeChecklistRecord(item as ChecklistRecord)));
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const resetForm = () => {
    if (!confirm('Deseja limpar todos os campos e iniciar um novo checklist?')) return;
    setCurrentChecklistId(null);
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
    setSignatureRequests(emptySignatureRequests());
    setCopiedRole(null);
    setSaveSuccess(false);
  };

  const loadChecklist = (item: ChecklistRecord) => {
    const normalized = normalizeChecklistRecord(item);
    setCurrentChecklistId(normalized.id);
    setFormData(normalized.form_data);
    setChecklist(normalized.checklist_items);
    setSignatures(normalized.signatures || {});
    setSignatureRequests(normalized.signature_requests || emptySignatureRequests());
    setActiveTab('editor');
    setSaveSuccess(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteFromHistory = async (e: React.MouseEvent, id: string, creatorId: string) => {
    e.stopPropagation();
    
    if (user?.id !== creatorId) {
      alert('Segurança: Você só pode excluir checklists criados por você mesmo.');
      return;
    }

    if (!confirm('Deseja realmente excluir este checklist permanentemente?')) return;
    
    try {
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
      let persistedRecord: ChecklistRecord | null = null;

      if (currentChecklistId) {
        const { data: existingData, error: existingError } = await supabase
          .from('checklists')
          .select('*')
          .eq('id', currentChecklistId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingError) throw existingError;
        if (existingData) {
          persistedRecord = normalizeChecklistRecord(existingData as ChecklistRecord);
        }
      }

      const mergedSignatures: SignatureData = {
        leaderSignature: signatures.leaderSignature || persistedRecord?.signatures?.leaderSignature || '',
        monitorSignature: signatures.monitorSignature || persistedRecord?.signatures?.monitorSignature || '',
      };

      const mergedRequests: SignatureRequests = {
        ...emptySignatureRequests(),
        ...(persistedRecord?.signature_requests || {}),
        ...signatureRequests,
        leader: {
          ...emptySignatureRequests().leader,
          ...(persistedRecord?.signature_requests?.leader || {}),
          ...(signatureRequests.leader || {}),
          signedAt: signatureRequests.leader?.signedAt || persistedRecord?.signature_requests?.leader?.signedAt || null,
        },
        monitor: {
          ...emptySignatureRequests().monitor,
          ...(persistedRecord?.signature_requests?.monitor || {}),
          ...(signatureRequests.monitor || {}),
          signedAt: signatureRequests.monitor?.signedAt || persistedRecord?.signature_requests?.monitor?.signedAt || null,
        },
      };

      const payload = {
        user_id: user.id,
        form_data: formData,
        checklist_items: checklist,
        signatures: mergedSignatures,
        signature_requests: mergedRequests,
        leader_signature: mergedSignatures.leaderSignature || null,
        monitor_signature: mergedSignatures.monitorSignature || null,
        leader_signed_at: mergedRequests.leader?.signedAt || null,
        monitor_signed_at: mergedRequests.monitor?.signedAt || null,
        created_at: new Date().toISOString()
      };

      const operation = currentChecklistId
        ? supabase
            .from('checklists')
            .update({
              form_data: payload.form_data,
              checklist_items: payload.checklist_items,
              signatures: payload.signatures,
              signature_requests: payload.signature_requests,
              leader_signature: payload.leader_signature,
              monitor_signature: payload.monitor_signature,
              leader_signed_at: payload.leader_signed_at,
              monitor_signed_at: payload.monitor_signed_at
            })
            .eq('id', currentChecklistId)
            .eq('user_id', user.id)
            .select('id')
            .single()
        : supabase
            .from('checklists')
            .insert([payload])
            .select('id')
            .single();

      const { data, error } = await operation;

      if (error) throw error;
      if (data?.id) {
        setCurrentChecklistId(data.id);
      }
      setSignatures(payload.signatures);
      setSignatureRequests(payload.signature_requests);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchHistory();
      return data?.id || currentChecklistId;
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar no banco. Verifique sua conexão e chaves do Supabase.');
    } finally {
      setIsSaving(false);
    }
  };

  const createRemoteSignatureLink = async (role: SignatureRole) => {
    const checklistId = currentChecklistId || await saveToSupabase();

    if (!checklistId) {
      return;
    }

    const nextToken = generateSignatureToken();
    const nextRequests: SignatureRequests = {
      ...signatureRequests,
      [role]: {
        token: nextToken,
        signedAt: null,
        signerName: role === 'leader' ? formData.lineLeader : formData.monitor,
      }
    };
    const nextSignatures = {
      ...signatures,
      [role === 'leader' ? 'leaderSignature' : 'monitorSignature']: '',
    };

    try {
      const { error } = await supabase
        .from('checklists')
        .update({
          signature_requests: nextRequests,
          signatures: nextSignatures,
          ...(role === 'leader'
            ? { leader_signature: null, leader_signed_at: null }
            : { monitor_signature: null, monitor_signed_at: null }),
        })
        .eq('id', checklistId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setCurrentChecklistId(checklistId);
      setSignatures(nextSignatures);
      setSignatureRequests(nextRequests);

      const link = buildSignatureLink(role, nextToken, checklistId);
      await navigator.clipboard.writeText(link);
      setCopiedRole(role);
      setTimeout(() => setCopiedRole(null), 2500);
      fetchHistory();
    } catch (err) {
      console.error('Erro ao gerar link de assinatura:', err);
      alert('Nao foi possivel gerar o link de assinatura.');
    }
  };

  const copyRemoteSignatureLink = async (role: SignatureRole) => {
    const link = buildSignatureLink(role, signatureRequests[role]?.token, currentChecklistId || undefined);
    if (!link) {
      alert('Gere o link antes de copiar.');
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setCopiedRole(role);
      setTimeout(() => setCopiedRole(null), 2500);
    } catch (err) {
      console.error('Erro ao copiar link:', err);
      alert('Nao foi possivel copiar o link.');
    }
  };

  const openWhatsAppForSignature = (role: SignatureRole) => {
    const link = buildSignatureLink(role, signatureRequests[role]?.token, currentChecklistId || undefined);
    if (!link) {
      alert('Gere o link antes de enviar pelo WhatsApp.');
      return;
    }

    const signerName = role === 'leader' ? formData.lineLeader : formData.monitor;
    const text = [
      `Ola${signerName ? ` ${signerName}` : ''},`,
      `segue o link para assinatura do checklist da linha ${formData.line || '---'}.`,
      link,
    ].join(' ');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
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
      pdf.save(`Checklist_Setup_${formData.line || 'LINHA'}_${formData.date}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Erro ao gerar PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const captureChecklistCanvas = useCallback(async () => {
    if (!printRef.current) return null;

    return html2canvas(printRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1000,
    });
  }, []);

  const downloadChecklistImage = useCallback(async () => {
    if (!printRef.current) return;

    setIsExportingImage(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const canvas = await captureChecklistCanvas();
      if (!canvas) return;

      const imageData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imageData;
      link.download = `Checklist_Setup_${formData.line || 'LINHA'}_${formData.date}.png`;
      link.click();
    } catch (error) {
      console.error('Erro ao gerar imagem:', error);
      alert('Erro ao gerar print do checklist.');
    } finally {
      setIsExportingImage(false);
    }
  }, [captureChecklistCanvas, formData.date, formData.line]);

  const sendChecklistToWhatsApp = useCallback(async () => {
    const checklistId = currentChecklistId || await saveToSupabase();
    if (!checklistId) return;

    setIsSendingToWhatsApp(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const canvas = await captureChecklistCanvas();
      if (!canvas) return;

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Falha ao converter o print para arquivo.');

      const fileName = `Checklist_Setup_${formData.line || 'LINHA'}_${formData.date}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const summary = `Checklist da linha ${formData.line || '---'} finalizado em ${formData.date}. Produto setup: ${formData.setupProduct || '---'}. Responsavel: ${formData.responsible || '---'}.`;

      const canShareFiles =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          title: `Checklist ${formData.line || 'Linha'}`,
          text: summary,
          files: [file],
        });
        return;
      }

      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(imageUrl);

      const whatsappText = `${summary} O print foi baixado automaticamente. Agora anexe a imagem no grupo para finalizar o envio.`;
      window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, '_blank', 'noopener,noreferrer');
      alert('O navegador não permitiu anexar arquivo direto. O print foi baixado: agora anexe no grupo do WhatsApp.');
    } catch (error) {
      console.error('Erro ao enviar checklist para WhatsApp:', error);
      alert('Nao foi possivel preparar o envio para o WhatsApp.');
    } finally {
      setIsSendingToWhatsApp(false);
    }
  }, [
    captureChecklistCanvas,
    currentChecklistId,
    formData.date,
    formData.line,
    formData.responsible,
    formData.setupProduct,
  ]);

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
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-[#004a99]" size={48} />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest animate-pulse">Iniciando Sistema...</p>
        </div>
      </div>
    );
  }

  if (isRemoteSigningView) {
    return (
      <RemoteSignaturePage
        role={remoteRoleParam as SignatureRole}
        token={remoteTokenParam as string}
        checklistId={remoteChecklistParam as string}
        line={remoteLineParam}
        setupProduct={remoteProductParam}
        responsible={remoteResponsibleParam}
        signerName={remoteSignerParam}
        onBackToApp={() => {
          window.location.href = getBaseUrl();
        }}
      />
    );
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-3 py-4 md:px-8 md:py-8">
      <header className="no-print mb-6 md:mb-8">
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center md:gap-6 mb-6 md:mb-8">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="bg-[#004a99] p-3 rounded-2xl text-white shadow-xl rotate-3 shrink-0">
              <FileCheck size={32} className="md:w-9 md:h-9" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight leading-none mb-1 uppercase">Setup Digital</h1>
              <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Grupo Multi • Engenharia Industrial</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
             <div className="bg-white w-full md:w-auto px-4 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#004a99]">
                     <UserIcon size={16} />
                  </div>
                  <div className="flex flex-col min-w-0">
                     <span className="text-xs font-black text-gray-800 uppercase leading-none truncate">{user.name}</span>
                     <span className="text-[10px] text-gray-400 font-bold">Acesso Ativo</span>
                  </div>
                </div>
                <button onClick={handleLogout} className="ml-2 text-gray-400 hover:text-red-500 transition-colors shrink-0">
                   <LogOut size={18} />
                </button>
             </div>
          </div>
        </div>

        <div className="flex p-1 bg-gray-200/50 rounded-2xl w-full shadow-inner border border-gray-200 md:max-w-md md:mx-auto">
           <button 
             onClick={() => setActiveTab('editor')}
             className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-black text-[11px] md:text-xs uppercase tracking-wide md:tracking-wider transition-all ${activeTab === 'editor' ? 'bg-white text-[#004a99] shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
           >
              <FilePlus size={16} /> Novo Setup
           </button>
           <button 
             onClick={() => setActiveTab('archive')}
             className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-black text-[11px] md:text-xs uppercase tracking-wide md:tracking-wider transition-all ${activeTab === 'archive' ? 'bg-white text-[#004a99] shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
           >
              <Factory size={16} /> Arquivo por Linha
           </button>
        </div>
      </header>

      {activeTab === 'editor' && (
        <main className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 gap-3 mb-4 no-print sm:grid-cols-2 md:flex md:justify-end">
            <button
              onClick={resetForm}
              className="flex min-h-[56px] items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 text-gray-700 font-black rounded-xl transition-all text-xs shadow-sm hover:border-blue-400"
            >
              <RotateCcw size={16} className="text-blue-500" /> Reiniciar Campos
            </button>
            
            <button
              onClick={saveToSupabase}
              disabled={isSaving}
              className={`flex items-center gap-2 px-5 py-2.5 ${
                saveSuccess ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'
              } min-h-[56px] justify-center font-black rounded-xl transition-all shadow-lg disabled:bg-gray-400 text-xs uppercase tracking-tighter`}
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={18} /> : <CloudUpload size={18} />}
              {saveSuccess ? 'Checklist Salvo!' : 'Salvar na Nuvem'}
            </button>

            <button
              onClick={exportPDF}
              disabled={isExporting}
              className={`flex items-center gap-2 px-6 py-2.5 ${
                isExporting ? 'bg-blue-400' : 'bg-[#004a99] hover:bg-[#003366]'
              } min-h-[56px] justify-center text-white font-black rounded-xl shadow-lg transition-all text-xs uppercase tracking-tighter`}
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download size={18} />
              )}
              Baixar Documento PDF
            </button>

            <button
              onClick={downloadChecklistImage}
              disabled={isExportingImage}
              className={`flex items-center gap-2 px-6 py-2.5 ${
                isExportingImage ? 'bg-cyan-400' : 'bg-cyan-600 hover:bg-cyan-700'
              } min-h-[56px] justify-center text-white font-black rounded-xl shadow-lg transition-all text-xs uppercase tracking-tighter`}
            >
              {isExportingImage ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Image size={18} />
              )}
              Baixar Print PNG
            </button>

            <button
              onClick={sendChecklistToWhatsApp}
              disabled={isSendingToWhatsApp}
              className={`flex items-center gap-2 px-6 py-2.5 ${
                isSendingToWhatsApp ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700'
              } min-h-[56px] justify-center text-white font-black rounded-xl shadow-lg transition-all text-xs uppercase tracking-tighter`}
            >
              {isSendingToWhatsApp ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send size={18} />
              )}
              Enviar no WhatsApp
            </button>
          </div>

          <div className="no-print mb-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-blue-700 md:hidden">
            Deslize lateralmente para preencher o checklist completo no celular.
          </div>

          <div className="overflow-x-auto pb-4 [-webkit-overflow-scrolling:touch]">
            <div 
              ref={printRef}
              className="bg-white border-[2px] border-black text-black overflow-hidden shadow-2xl mb-12 mx-auto min-w-[1000px]"
              style={{ width: '100%', maxWidth: '1000px' }}
            >
            {/* Template FI 12 70 */}
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

            {/* Form Fields Section */}
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

            <div className="border-t-[2px] border-black bg-slate-50 no-print">
              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                {(['leader', 'monitor'] as SignatureRole[]).map((role) => {
                  const isLeader = role === 'leader';
                  const roleName = isLeader ? 'Lider' : 'Monitor';
                  const signerName = isLeader ? formData.lineLeader : formData.monitor;
                  const request = signatureRequests[role];
                  const link = buildSignatureLink(role, request?.token, currentChecklistId || undefined);
                  const hasSigned = Boolean(request?.signedAt || (isLeader ? signatures.leaderSignature : signatures.monitorSignature));

                  return (
                    <div key={role} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Assinatura Remota</p>
                          <p className="mt-1 text-sm font-black uppercase text-slate-800">{roleName}: {signerName || 'Nao informado'}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${hasSigned ? 'bg-emerald-100 text-emerald-700' : request?.token ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {hasSigned ? 'Assinado' : request?.token ? 'Pendente' : 'Sem link'}
                        </span>
                      </div>

                      <p className="mt-3 break-all rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500">
                        {link || 'Gere um link para enviar ao responsavel assinar pelo proprio celular.'}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => createRemoteSignatureLink(role)}
                          className="flex items-center gap-2 rounded-xl bg-[#004a99] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-lg"
                        >
                          <LinkIcon size={14} />
                          {request?.token ? 'Gerar novo link' : 'Gerar link'}
                        </button>
                        <button
                          onClick={() => copyRemoteSignatureLink(role)}
                          disabled={!request?.token}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
                        >
                          <Copy size={14} />
                          {copiedRole === role ? 'Copiado' : 'Copiar link'}
                        </button>
                        <button
                          onClick={() => openWhatsAppForSignature(role)}
                          disabled={!request?.token}
                          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-700 disabled:opacity-50"
                        >
                          <MessageCircle size={14} />
                          Enviar WhatsApp
                        </button>
                        {currentChecklistId && (
                          <button
                            onClick={() => refreshChecklistFromDatabase(currentChecklistId)}
                            disabled={isRefreshingSignatures}
                            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
                          >
                            <RefreshCcw size={14} className={isRefreshingSignatures ? 'animate-spin' : ''} />
                            Atualizar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

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
          </div>
        </main>
      )}

      {activeTab === 'archive' && (
        <main className="animate-in fade-in slide-in-from-right-4 duration-500">
           <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
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
