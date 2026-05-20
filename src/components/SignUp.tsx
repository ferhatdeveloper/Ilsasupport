import { useState } from 'react';
import { UserPlus, Lock, Mail, User } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';

interface SignUpProps {
  onSignUp: (token: string, user: any) => void;
  onSwitchToSignIn: () => void;
}

export function SignUp({ onSignUp, onSwitchToSignIn }: SignUpProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Önce kullanıcıyı oluştur
      const signupResponse = await fetch(
        `${apiFunctionsBase}/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            name,
          }),
        }
      );

      const signupData = await signupResponse.json();

      if (!signupResponse.ok) {
        setError(signupData.error || 'Kayıt başarısız');
        setLoading(false);
        return;
      }

      // Sonra giriş yap
      const signinResponse = await fetch(
        `${apiFunctionsBase}/signin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: email.trim().toLowerCase(),
            email: email.trim().toLowerCase(),
            password,
          }),
        }
      );

      const signinData = await signinResponse.json();

      if (!signinResponse.ok) {
        setError(signinData.error || 'Giriş başarısız');
        setLoading(false);
        return;
      }

      onSignUp(signinData.accessToken, signinData.user);
    } catch (err) {
      console.error('Kayıt hatası:', err);
      setError('Bir hata oluştu');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-gray-900 mb-2">Hesap Oluştur</h1>
          <p className="text-gray-600">Yeni hesap oluşturun</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-700 mb-2">
              Ad Soyad
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Adınız Soyadınız"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-700 mb-2">
              E-posta
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="ornek@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-700 mb-2">
              Şifre
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Kayıt yapılıyor...
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                Kayıt Ol
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Zaten hesabınız var mı?{' '}
            <button
              onClick={onSwitchToSignIn}
              className="text-blue-600 hover:underline"
            >
              Giriş Yap
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
