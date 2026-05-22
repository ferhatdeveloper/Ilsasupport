import { useEffect, useState } from 'react';
import { TrendingUp, Users, FileText, Download, Database, Activity } from 'lucide-react';
import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';
import { AdminServerHealth } from './AdminServerHealth';

export function AdminStatsPage() {
  const [stats, setStats] = useState<any>(null);
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      beginLoad();
      setLoadError(null);

      const response = await adminFetch(`${apiFunctionsBase}/admin/stats`);

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats ?? null);
      } else {
        const t = await response.text();
        let msg = `HTTP ${response.status}`;
        try {
          const j = JSON.parse(t);
          msg = [j.error, j.detail].filter(Boolean).join(' — ') || msg;
        } catch {
          if (t) msg = t.slice(0, 200);
        }
        setLoadError(msg);
        setStats(null);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
      setLoadError('İstatistikler alınamadı.');
      setStats(null);
    } finally {
      endLoad();
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8">
        <h1 className="text-3xl text-white mb-2">Özet</h1>
        <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-red-200 mb-4">{loadError}</div>
        <button
          type="button"
          onClick={() => void loadStats()}
          className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
        >
          Yeniden dene
        </button>
      </div>
    );
  }

  const s = stats || {};
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl text-white mb-2">Özet</h1>
        <p className="text-gray-400">Sistem genel görünümü ve istatistikler</p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg p-6 border border-purple-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <span className="text-purple-200 text-sm">Toplam</span>
          </div>
          <div className="text-3xl text-white mb-1">
            {s.totalUsers || 0}
          </div>
          <div className="text-purple-200 text-sm">Kayıtlı Kullanıcı</div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg p-6 border border-blue-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="text-blue-200 text-sm">Toplam</span>
          </div>
          <div className="text-3xl text-white mb-1">
            {s.totalFiles || 0}
          </div>
          <div className="text-blue-200 text-sm">Dosya</div>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-lg p-6 border border-green-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Download className="w-6 h-6 text-white" />
            </div>
            <span className="text-green-200 text-sm">Toplam</span>
          </div>
          <div className="text-3xl text-white mb-1">
            {s.totalDownloads || 0}
          </div>
          <div className="text-green-200 text-sm">İndirme</div>
        </div>

        <div className="bg-gradient-to-br from-orange-600 to-orange-800 rounded-lg p-6 border border-orange-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-white" />
            </div>
            <span className="text-orange-200 text-sm">Toplam</span>
          </div>
          <div className="text-3xl text-white mb-1">
            {s.totalCategories || 0}
          </div>
          <div className="text-orange-200 text-sm">Kategori</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-lg p-6 border border-emerald-500">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <span className="text-emerald-200 text-sm">Şimdi</span>
          </div>
          <div className="text-3xl text-white mb-1">
            {s.onlineUsers ?? 0}
          </div>
          <div className="text-emerald-200 text-sm">
            Çevrimiçi kullanıcı
            {(s.onlineConnections ?? 0) > 0 && (
              <span className="block text-emerald-300/80 text-xs mt-0.5">
                {s.onlineConnections} aktif bağlantı
              </span>
            )}
          </div>
        </div>
      </div>

      {/* User Plan Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg text-white">Free Kullanıcılar</h3>
            <span className="px-3 py-1 bg-gray-600 text-white text-sm rounded">Free</span>
          </div>
          <div className="text-4xl text-white mb-2">
            {s.freeUsers || 0}
          </div>
          <div className="text-sm text-gray-400">
            {s.totalUsers > 0 
              ? `${((s.freeUsers || 0) / s.totalUsers * 100).toFixed(1)}%` 
              : '0%'} toplam kullanıcı
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg text-white">Premium Kullanıcılar</h3>
            <span className="px-3 py-1 bg-purple-600 text-white text-sm rounded">Premium</span>
          </div>
          <div className="text-4xl text-white mb-2">
            {s.premiumUsers || 0}
          </div>
          <div className="text-sm text-gray-400">
            {s.totalUsers > 0 
              ? `${((s.premiumUsers || 0) / s.totalUsers * 100).toFixed(1)}%` 
              : '0%'} toplam kullanıcı
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg text-white">Admin Kullanıcılar</h3>
            <span className="px-3 py-1 bg-red-600 text-white text-sm rounded">Admin</span>
          </div>
          <div className="text-4xl text-white mb-2">
            {s.adminUsers || 0}
          </div>
          <div className="text-sm text-gray-400">
            {s.totalUsers > 0 
              ? `${((s.adminUsers || 0) / s.totalUsers * 100).toFixed(1)}%` 
              : '0%'} toplam kullanıcı
          </div>
        </div>
      </div>

      {/* File Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg text-white mb-4">Dosya Dağılımı</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">Free Dosyalar</span>
                <span className="text-white">{s.freeFiles || 0}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ 
                    width: `${s.totalFiles > 0 
                      ? ((s.freeFiles || 0) / s.totalFiles * 100) 
                      : 0}%` 
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400">Premium Dosyalar</span>
                <span className="text-white">{s.premiumFiles || 0}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full"
                  style={{ 
                    width: `${s.totalFiles > 0 
                      ? ((s.premiumFiles || 0) / s.totalFiles * 100) 
                      : 0}%` 
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg text-white mb-4">Sistem Aktivitesi</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Activity className="w-4 h-4" />
                <span>Çevrimiçi kullanıcı</span>
              </div>
              <span className="text-emerald-400 font-medium">{s.onlineUsers ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Users className="w-4 h-4" />
                <span>Kayıtlı oturum sayısı (KV)</span>
              </div>
              <span className="text-white">{s.activeSessions || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Download className="w-4 h-4" />
                <span>Bugün İndirmeler</span>
              </div>
              <span className="text-white">{s.todayDownloads || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Users className="w-4 h-4" />
                <span>Bu Hafta Yeni Üyeler</span>
              </div>
              <span className="text-white">{s.weekNewUsers || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <AdminServerHealth />

      {/* Aynı IP — birden fazla hesap */}
      <div className="bg-gray-800 border border-amber-700/50 rounded-lg p-6 mb-8">
        <h3 className="text-lg text-white mb-2">Aynı IP adresinden giriş yapanlar</h3>
        <p className="text-sm text-gray-400 mb-4">
          Başarılı girişlerde aynı IP ile birden fazla farklı hesap tespit edildiğinde listelenir.
        </p>
        {s.ipLoginSummary && s.ipLoginSummary.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4">Konum</th>
                  <th className="py-2 pr-4">Hesap</th>
                  <th className="py-2 pr-4">Kullanıcılar</th>
                  <th className="py-2">Son giriş</th>
                </tr>
              </thead>
              <tbody>
                {s.ipLoginSummary.map((row: any) => (
                  <tr key={row.ipAddress} className="border-b border-gray-700/50">
                    <td className="py-2 pr-4 font-mono text-xs text-amber-200">{row.ipAddress}</td>
                    <td className="py-2 pr-4 text-xs text-gray-300 max-w-[220px]">
                      {row.location || row.city || '—'}
                    </td>
                    <td className="py-2 pr-4">{row.userCount}</td>
                    <td className="py-2 pr-4">{(row.usernames || []).join(', ') || '—'}</td>
                    <td className="py-2">
                      {row.lastAt ? new Date(row.lastAt).toLocaleString('tr-TR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Şu an uyarı verilecek IP çakışması yok.</p>
        )}
      </div>

      {/* Son girişler + konum */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
        <h3 className="text-lg text-white mb-4">Son girişler (IP konumu)</h3>
        {s.recentLogins && s.recentLogins.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="py-2 pr-3">Zaman</th>
                  <th className="py-2 pr-3">Kullanıcı</th>
                  <th className="py-2 pr-3">IP</th>
                  <th className="py-2 pr-3">Konum</th>
                  <th className="py-2">Kanal</th>
                </tr>
              </thead>
              <tbody>
                {s.recentLogins.map((row: any) => (
                  <tr key={row.id} className="border-b border-gray-700/50">
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('tr-TR')}
                    </td>
                    <td className="py-2 pr-3">{row.username || '—'}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.ipAddress}</td>
                    <td className="py-2 pr-3 text-xs max-w-[200px]">{row.location}</td>
                    <td className="py-2 text-xs">
                      <span className={row.success ? 'text-green-400' : 'text-red-400'}>
                        {row.channel} {row.success ? '✓' : '✗'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Henüz giriş kaydı yok.</p>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 className="text-lg text-white mb-4">Son İndirmeler</h3>
        {s.recentDownloads && s.recentDownloads.length > 0 ? (
          <div className="space-y-2">
            {s.recentDownloads.map((download: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-600/20 rounded-full flex items-center justify-center">
                    <Download className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-white text-sm">{download.fileName}</div>
                    <div className="text-gray-400 text-xs">{download.userName}</div>
                  </div>
                </div>
                <div className="text-gray-400 text-sm">
                  {new Date(download.downloadedAt).toLocaleDateString('tr-TR')}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            Henüz indirme yok
          </div>
        )}
      </div>
    </div>
  );
}