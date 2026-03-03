import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import SignatureCanvas from './SignatureCanvas';
import { supabase } from '../lib/supabase';
import { SignatureRole } from '../types';

interface RemoteSignaturePageProps {
  checklistId: string;
  token: string;
  role: SignatureRole;
  line: string;
  setupProduct: string;
  responsible: string;
  signerName: string;
  onBackToApp: () => void;
}

const roleLabel: Record<SignatureRole, string> = {
  leader: 'Lider',
  monitor: 'Monitor',
};

const getFriendlyErrorMessage = (message?: string) => {
  const normalized = (message || '').toLowerCase();

  if (normalized.includes('already signed')) {
    return 'Este link ja foi utilizado e a assinatura desse responsavel ja esta registrada.';
  }

  if (normalized.includes('invalid or expired signature token')) {
    return 'Este link nao e mais valido. Gere um novo link no checklist principal.';
  }

  return 'Nao foi possivel salvar a assinatura.';
};

const RemoteSignaturePage: React.FC<RemoteSignaturePageProps> = ({
  checklistId,
  token,
  role,
  line,
  setupProduct,
  responsible,
  signerName,
  onBackToApp,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [signature, setSignature] = useState('');

  const handleSubmit = async () => {
    if (!signature) {
      setError('A assinatura precisa ser preenchida antes de enviar.');
      return;
    }

    setSaving(true);
    setError('');

    const { data, error: updateError } = await supabase.rpc('sign_checklist_by_token', {
      p_checklist_id: checklistId,
      p_role: role,
      p_token: token,
      p_signature: signature,
      p_signer_name: null,
    });

    if (updateError || !data) {
      setError(getFriendlyErrorMessage(updateError?.message));
      setSaving(false);
      return;
    }

    setSuccess(true);
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="bg-[#004a99] px-6 py-8 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-100">Assinatura Remota</p>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight">Checklist de Setup</h1>
          <p className="mt-2 text-sm font-bold text-blue-100">Assinatura do {roleLabel[role]} para a linha {line || '---'}</p>
        </div>

        <div className="p-6 md:p-8">
          {error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-red-700">
              <div className="flex items-center gap-3 text-sm font-black uppercase">
                <AlertTriangle size={18} />
                Erro no link de assinatura
              </div>
              <p className="mt-2 text-sm font-medium">{error}</p>
              <button
                onClick={onBackToApp}
                className="mt-5 rounded-xl bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-red-700 border border-red-200"
              >
                Voltar para o sistema
              </button>
            </div>
          ) : success ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-emerald-800">
              <div className="flex items-center gap-3 text-sm font-black uppercase">
                <CheckCircle2 size={18} />
                Assinatura registrada
              </div>
              <p className="mt-2 text-sm font-medium">
                A assinatura de {signerName || roleLabel[role]} foi salva com sucesso. O checklist principal ja pode ser atualizado automaticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Linha</p>
                  <p className="mt-1 font-bold">{line || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Produto</p>
                  <p className="mt-1 font-bold">{setupProduct || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Responsavel pelo setup</p>
                  <p className="mt-1 font-bold">{responsible || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{roleLabel[role]}</p>
                  <p className="mt-1 font-bold">{signerName || roleLabel[role]}</p>
                </div>
              </div>

              <SignatureCanvas
                label={`Assinatura ${roleLabel[role]}: ${signerName || roleLabel[role]}`}
                onSave={setSignature}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleSubmit}
                  disabled={saving || !signature}
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg disabled:bg-slate-300"
                >
                  {saving ? 'Salvando assinatura...' : 'Enviar assinatura'}
                </button>
                <button
                  onClick={onBackToApp}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600"
                >
                  Voltar para o sistema
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RemoteSignaturePage;
