
import React, { useState } from 'react';
import { User as UserIcon, Lock, UserPlus, LogIn, ChevronRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { User } from '../types';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '', 
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.name === 'username' ? e.target.value.trim().toLowerCase() : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
    setError('');
    setSuccessMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    // Sanitização final do identificador
    const cleanUsername = formData.username.trim().toLowerCase();
    const internalEmail = cleanUsername.includes('@') 
      ? cleanUsername 
      : `${cleanUsername}@setup.digital`;

    try {
      if (isLogin) {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: internalEmail,
          password: formData.password,
        });

        if (loginError) {
          if (loginError.message.includes('Invalid login credentials') || loginError.message.includes('Email not confirmed')) {
            throw new Error('Usuário não cadastrado ou senha incorreta.');
          }
          throw loginError;
        }

        if (data.user) {
          onLogin({
            id: data.user.id,
            name: data.user.user_metadata.full_name || cleanUsername,
            username: cleanUsername
          });
        }
      } else {
        if (!formData.name || !cleanUsername || !formData.password) {
          throw new Error('Preencha todos os campos obrigatórios.');
        }
        if (formData.password !== formData.confirmPassword) {
          throw new Error('As senhas digitadas não são iguais.');
        }
        if (formData.password.length < 6) {
          throw new Error('A senha deve ter no mínimo 6 caracteres.');
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: internalEmail,
          password: formData.password,
          options: {
            data: {
              full_name: formData.name,
            }
          }
        });

        if (signUpError) {
          if (signUpError.message.includes('User already registered')) {
            throw new Error('Este usuário ou RE já está cadastrado no sistema.');
          }
          throw signUpError;
        }

        if (data.session) {
          onLogin({
            id: data.user!.id,
            name: data.user!.user_metadata.full_name || cleanUsername,
            username: cleanUsername
          });
        } else {
          setSuccessMessage('Acesso criado! Você já pode entrar com seu Usuário/RE.');
          setIsLogin(true);
          setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
        <div className="bg-[#004a99] p-8 text-center">
          <div className="flex items-baseline justify-center gap-0.5 mb-2">
            <span className="text-[#89b4e1] text-3xl font-normal lowercase tracking-tighter">grupo</span>
            <span className="text-white text-4xl font-bold lowercase tracking-tighter">multi</span>
          </div>
          <p className="text-[#89b4e1] text-[10px] font-black uppercase tracking-[0.3em]">Engenharia Industrial</p>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-black text-gray-800 mb-6 text-center uppercase tracking-tight">
            {isLogin ? 'Acesso ao Sistema' : 'Cadastro de Colaborador'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Nome Completo</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                  <input
                    type="text"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004a99] focus:border-transparent outline-none transition-all text-sm font-bold"
                    placeholder="Nome e Sobrenome"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Usuário / RE</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                <input
                  type="text"
                  name="username"
                  required
                  value={formData.username}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004a99] focus:border-transparent outline-none transition-all text-sm font-bold"
                  placeholder="Seu registro"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                <input
                  type="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004a99] focus:border-transparent outline-none transition-all text-sm font-bold"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {!isLogin && (
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">Confirmar Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                  <input
                    type="password"
                    name="confirmPassword"
                    required
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004a99] focus:border-transparent outline-none transition-all text-sm font-bold"
                    placeholder="Repita a senha"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="text-red-600 text-[10px] font-black bg-red-50 p-3 rounded-lg border border-red-100 uppercase flex items-center gap-2">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {successMessage && (
              <div className="text-emerald-700 text-[10px] font-black bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex items-center gap-2 uppercase">
                <CheckCircle2 size={16} /> {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#004a99] hover:bg-[#003366] disabled:bg-gray-300 text-white font-black py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 mt-6 uppercase text-xs tracking-widest"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isLogin ? (
                <>
                  <LogIn size={18} /> Acessar Sistema
                </>
              ) : (
                <>
                  <UserPlus size={18} /> Criar Acesso
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <button
              disabled={loading}
              onClick={() => { setIsLogin(!isLogin); setError(''); setSuccessMessage(''); }}
              className="text-[10px] font-black text-[#004a99] hover:text-[#003366] flex items-center justify-center gap-1 mx-auto uppercase tracking-tighter"
            >
              {isLogin ? (
                <>Ainda não tem cadastro? Clique aqui <ChevronRight size={14} /></>
              ) : (
                <>Já possui acesso? Voltar ao login <ChevronRight size={14} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
