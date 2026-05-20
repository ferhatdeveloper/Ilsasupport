import { useState, useEffect, useRef } from 'react';
import { Users, UserPlus, Shield, Clock, HardDrive, Trash2, Edit, Search, Filter, Download, Calendar, FileSpreadsheet } from 'lucide-react';
import { AdminUserEditPage } from './AdminUserEditPage';
import { toast } from 'sonner@2.0.3';
import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { useTheme } from '../../contexts/ThemeContext';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';
import { formatPlanLabel } from '../../utils/turkishLabels';

interface User {
  id: string;
  username: string;
  email?: string | null;
  name: string;
  role?: string;
  plan: 'free' | 'premium' | 'admin';
  createdAt: string;
  expiresAt?: string;
  downloadCount: number;
  activeSessions: number;
  maxSessions: number;
  hardwareId?: string;
  lastLoginAt?: string;
  loginApproved?: boolean;
}

export function AdminUsersPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const statCardClass = isDark
    ? 'rounded-xl border border-gray-700 bg-gray-800/50 p-4 backdrop-blur'
    : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
  const statLabelClass = isDark ? 'mb-1 text-sm text-slate-400' : 'mb-1 text-sm text-slate-500';
  const statValueClass = isDark ? 'text-2xl font-semibold text-slate-50' : 'text-2xl font-semibold text-slate-900';

  const inputClass = isDark
    ? 'w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-600 focus:border-transparent'
    : 'w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600 focus:border-transparent';

  const filterSelectClass = isDark
    ? 'px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-600 focus:border-transparent'
    : 'px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600 focus:border-transparent';

  const tableWrapClass = isDark
    ? 'bg-gray-800 border border-gray-700 rounded-lg overflow-hidden'
    : 'bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm';
  const theadClass = isDark ? 'bg-gray-900' : 'bg-slate-100';
  const thClass = isDark
    ? 'px-6 py-4 text-left text-xs text-gray-400 uppercase tracking-wider'
    : 'px-6 py-4 text-left text-xs text-slate-600 uppercase tracking-wider';
  const thClassRight = isDark
    ? 'px-6 py-4 text-right text-xs text-gray-400 uppercase tracking-wider'
    : 'px-6 py-4 text-right text-xs text-slate-600 uppercase tracking-wider';
  const tbodyDivideClass = isDark ? 'divide-y divide-gray-700' : 'divide-y divide-slate-200';
  const trHoverClass = isDark ? 'hover:bg-gray-800/80' : 'hover:bg-slate-50';

  const pageBtnClass = isDark
    ? 'px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700'
    : 'px-4 py-2 bg-white text-slate-900 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 shadow-sm';
  const pageNumInactiveClass = isDark
    ? 'border border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50';

  const [users, setUsers] = useState<User[]>([]);
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState<'all' | 'free' | 'premium' | 'admin'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showDownloadsModal, setShowDownloadsModal] = useState(false);
  const [userDownloads, setUserDownloads] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const fileImportRef = useRef<HTMLInputElement>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  useEffect(() => {
    loadUsers();
  }, []);
  
  // Reset to page 1 when search/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterPlan]);

  const loadUsers = async () => {
    try {
      beginLoad();
      const response = await adminFetch(`${apiFunctionsBase}/admin/users`);

      if (response.ok) {
        const data = await response.json();
        console.log('Users response:', data);
        console.log('Users array:', data.users);
        setUsers(data.users || []);
      } else {
        const errorText = await response.text();
        console.error('Failed to load users:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      endLoad();
    }
  };

  const loadUserDownloads = async (userId: string) => {
    try {
      const response = await adminFetch(`${apiFunctionsBase}/admin/users/${userId}/downloads`);

      if (response.ok) {
        const data = await response.json();
        setUserDownloads(data.downloads || []);
        setShowDownloadsModal(true);
      }
    } catch (error) {
      console.error('Error loading downloads:', error);
    }
  };

  const extendSubscription = async (userId: string, days: number) => {
    try {
      const response = await adminFetch(
        `${apiFunctionsBase}/admin/users/${userId}/extend`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days }),
        }
      );

      if (response.ok) {
        toast.success(`Abonelik ${days} gün uzatıldı!`);
        loadUsers();
      } else {
        const error = await response.json();
        toast.error(`Hata: ${error.error}`);
      }
    } catch (error) {
      console.error('Error extending subscription:', error);
      toast.error('Süre uzatma başarısız');
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      const response = await adminFetch(
        `${apiFunctionsBase}/admin/users/${userId}`,
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        toast.success('Kullanıcı silindi!');
        loadUsers();
      } else {
        const error = await response.json();
        toast.error(`Hata: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Kullanıcı silme başarısız');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error('Yalnızca .xlsx (Excel) dosyası seçin.');
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await adminFetch(`${apiFunctionsBase}/admin/users/import-file`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'İçe aktarma başarısız');
        return;
      }
      toast.success(
        `İçe aktarma tamamlandı: ${data.createdCount ?? 0} yeni, ${data.skippedCount ?? 0} atlandı, ${data.errorsCount ?? 0} hata. Yeni kullanıcı şifresi: 11223344`,
        { duration: 10_000 },
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        console.warn('İçe aktarma satır hataları:', data.errors);
      }
      loadUsers();
    } catch {
      toast.error('Dosya yüklenemedi');
    } finally {
      setImporting(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const u = (user.username || '').toLowerCase();
    const em = (user.email || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch = u.includes(q) || em.includes(q) ||
                         user.name.toLowerCase().includes(q);
    const matchesPlan = filterPlan === 'all' || user.plan === filterPlan;
    return matchesSearch && matchesPlan;
  });

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'admin': return 'bg-red-600 text-white';
      case 'premium': return 'bg-purple-600 text-white';
      default: return isDark ? 'bg-gray-600 text-white' : 'bg-slate-200 text-slate-800';
    }
  };

  if (editingUserId) {
    return (
      <AdminUserEditPage
        userId={editingUserId}
        onBack={() => setEditingUserId(null)}
        onSaved={() => void loadUsers()}
      />
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={isDark ? 'mb-2 text-3xl text-slate-50' : 'mb-2 text-3xl text-slate-900'}>
              Kullanıcı Yönetimi
            </h1>
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>Tüm kullanıcıları görüntüleyin ve yönetin</p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end sm:max-w-md">
            <div className="flex flex-wrap justify-end gap-2">
              <input
                ref={fileImportRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleImportFile}
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => fileImportRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0" />
                {importing ? 'İçe aktarılıyor…' : 'Excel (.xlsx) içe aktar'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-purple-700 hover:shadow-lg"
              >
                <UserPlus className="h-5 w-5 shrink-0" />
                Yeni Kullanıcı
              </button>
            </div>

            <a
              href="/templates/kullanici-ice-aktarma-ornek.xlsx"
              download="kullanici-ice-aktarma-ornek.xlsx"
              className={
                isDark
                  ? 'group flex items-center gap-3 rounded-xl border border-emerald-800/80 bg-gradient-to-r from-emerald-950/60 to-gray-900/80 px-4 py-3 shadow-md transition hover:border-emerald-600/60 hover:from-emerald-900/50'
                  : 'group flex items-center gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 shadow-sm transition hover:border-emerald-400 hover:shadow-md'
              }
            >
              <span
                className={
                  isDark
                    ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-500/40'
                    : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80'
                }
              >
                <Download className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className={isDark ? 'block text-sm font-semibold text-emerald-100' : 'block text-sm font-semibold text-emerald-900'}>
                  Örnek Excel şablonu
                </span>
                <span className={isDark ? 'mt-0.5 block text-xs text-gray-400' : 'mt-0.5 block text-xs text-slate-600'}>
                  Sütunlar, formüller ve örnek satırlar — tıklayınca indirilir
                </span>
              </span>
              <span
                className={
                  isDark
                    ? 'shrink-0 rounded-lg bg-emerald-700/40 px-3 py-1.5 text-xs font-medium text-emerald-100 group-hover:bg-emerald-600/50'
                    : 'shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white group-hover:bg-emerald-700'
                }
              >
                İndir
              </span>
            </a>

            <p className={isDark ? 'text-right text-xs leading-relaxed text-slate-500' : 'text-right text-xs leading-relaxed text-slate-500'}>
              <strong>Zorunlu:</strong> Kullanıcı adı (Username). <strong>İsteğe bağlı:</strong> Ad Soyad, Plan (free / premium / admin),{' '}
              <strong>Maks cihaz (oturum)</strong>, <strong>Kayıt tarihi</strong>, <strong>Üyelik süresi (gün)</strong> — şablonda bitiş ve kalan gün Excel formülleriyle hesaplanır; içe aktarmada süre bu alanlardan hesaplanır.
              Yalnızca <strong>.xlsx</strong>. Yeni kayıtların şifresi <strong>11223344</strong>. Kayıtlı kullanıcı adları atlanır.
            </p>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDark ? 'text-gray-400' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder="Kullanıcı adı veya isim ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={inputClass}
            />
          </div>
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value as any)}
            className={filterSelectClass}
          >
            <option value="all">Tüm Planlar</option>
            <option value="free">Free</option>
            <option value="premium">Premium</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className={statCardClass}>
            <div className={statLabelClass}>Toplam Kullanıcı</div>
            <div className={statValueClass}>{users.length}</div>
          </div>
          <div className={statCardClass}>
            <div className={statLabelClass}>Free</div>
            <div className={statValueClass}>{users.filter(u => u.plan === 'free').length}</div>
          </div>
          <div className={statCardClass}>
            <div className={statLabelClass}>Premium</div>
            <div className={statValueClass}>{users.filter(u => u.plan === 'premium').length}</div>
          </div>
          <div className={statCardClass}>
            <div className={statLabelClass}>Admin</div>
            <div className={statValueClass}>{users.filter(u => u.plan === 'admin').length}</div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className={isDark ? 'py-12 text-center text-slate-400' : 'py-12 text-center text-slate-500'}>Yükleniyor...</div>
      ) : (
        <div className={tableWrapClass}>
          <table className="w-full">
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Kullanıcı</th>
                <th className={thClass}>Plan</th>
                <th className={thClass}>Süre</th>
                <th className={thClass}>İndirme</th>
                <th className={thClass}>Oturum</th>
                <th className={thClass}>Cihaz</th>
                <th className={thClassRight}>İşlemler</th>
              </tr>
            </thead>
            <tbody className={tbodyDivideClass}>
              {filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((user) => (
                <tr key={user.id} className={trHoverClass}>
                  <td className="px-6 py-4">
                    <div>
                      <div className={isDark ? 'text-white' : 'text-slate-900'}>{user.name}</div>
                      <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
                        @{user.username}
                        {user.email ? ` · ${user.email}` : ''}
                        {user.plan !== 'admin' && user.loginApproved === false && (
                          <span className="ml-2 text-xs text-amber-500">· Onay bekliyor</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded ${getPlanBadgeColor(user.plan)}`}>
                      {formatPlanLabel(user.plan)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.expiresAt ? (
                      <div className="text-sm">
                        <div className={isDark ? 'text-white' : 'text-slate-900'}>{new Date(user.expiresAt).toLocaleDateString('tr-TR')}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
                          {Math.ceil((new Date(user.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} gün kaldı
                        </div>
                      </div>
                    ) : (
                      <span className={isDark ? 'text-gray-400' : 'text-slate-600'}>Süresiz</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => loadUserDownloads(user.id)}
                      className="text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                      {user.downloadCount}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className={isDark ? 'text-white' : 'text-slate-900'}>{user.activeSessions} / {user.maxSessions}</span>
                  </td>
                  <td className="px-6 py-4">
                    {user.hardwareId ? (
                      <span
                        className={
                          isDark
                            ? 'inline-flex items-center gap-1 text-xs text-emerald-400'
                            : 'inline-flex items-center gap-1 text-xs text-emerald-700'
                        }
                        title={user.hardwareId}
                      >
                        <HardDrive className="w-4 h-4 shrink-0" />
                        Kayıtlı
                      </span>
                    ) : (
                      <span className={isDark ? 'text-gray-500' : 'text-slate-500'}>-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingUserId(user.id)}
                        className={
                          isDark
                            ? 'p-2 text-blue-400 hover:text-blue-300 hover:bg-gray-700 rounded'
                            : 'p-2 text-blue-600 hover:text-blue-700 hover:bg-slate-100 rounded'
                        }
                        title="Üye tipi ve şifre düzenle"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {user.plan !== 'admin' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const days = prompt('Kaç gün uzatmak istiyorsunuz?');
                              if (days && !isNaN(parseInt(days))) {
                                extendSubscription(user.id, parseInt(days));
                              }
                            }}
                            className={
                              isDark
                                ? 'p-2 text-green-400 hover:text-green-300 hover:bg-gray-700 rounded'
                                : 'p-2 text-green-600 hover:text-green-700 hover:bg-slate-100 rounded'
                            }
                            title="Süre Uzat"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteUser(user.id)}
                            className={
                              isDark
                                ? 'p-2 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded'
                                : 'p-2 text-red-600 hover:text-red-700 hover:bg-slate-100 rounded'
                            }
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className={isDark ? 'py-12 text-center text-slate-400' : 'py-12 text-center text-slate-500'}>
              Kullanıcı bulunamadı
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {filteredUsers.length > itemsPerPage && (
        <div className="mt-6 flex items-center justify-between">
          <div className={isDark ? 'text-sm text-gray-400' : 'text-sm text-slate-600'}>
            {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredUsers.length)} / {filteredUsers.length} kullanıcı gösteriliyor
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className={pageBtnClass}
            >
              Önceki
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.ceil(filteredUsers.length / itemsPerPage) }, (_, i) => i + 1)
                .filter(page => {
                  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
                  return page === 1 || 
                         page === totalPages || 
                         Math.abs(page - currentPage) <= 2;
                })
                .map((page, idx, arr) => (
                  <div key={page} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== page - 1 && (
                      <span className={isDark ? 'px-2 text-gray-400' : 'px-2 text-slate-500'}>...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        currentPage === page
                          ? 'border border-purple-600 bg-purple-600 text-white'
                          : pageNumInactiveClass
                      }`}
                    >
                      {page}
                    </button>
                  </div>
                ))}
            </div>
            <button
              onClick={() => setCurrentPage(Math.min(Math.ceil(filteredUsers.length / itemsPerPage), currentPage + 1))}
              disabled={currentPage === Math.ceil(filteredUsers.length / itemsPerPage)}
              className={pageBtnClass}
            >
              Sonraki
            </button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => {
            setShowCreateModal(false);
            loadUsers();
          }}
        />
      )}

      {/* Downloads Modal */}
      {showDownloadsModal && (
        <DownloadsModal
          downloads={userDownloads}
          onClose={() => {
            setShowDownloadsModal(false);
            setUserDownloads([]);
          }}
        />
      )}
    </div>
  );
}

// Create User Modal Component
function CreateUserModal({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const modalPanelClass = isDark
    ? 'bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700'
    : 'bg-white rounded-lg p-6 w-full max-w-md border border-slate-200 shadow-xl';
  const modalTitleClass = isDark ? 'text-xl text-white mb-4' : 'text-xl text-slate-900 mb-4';
  const labelClass = isDark ? 'block text-sm text-gray-400 mb-1' : 'block text-sm text-slate-600 mb-1';
  const fieldClass = isDark
    ? 'w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white focus:ring-2 focus:ring-purple-600'
    : 'w-full px-3 py-2 bg-white border border-slate-200 rounded text-slate-900 focus:ring-2 focus:ring-purple-600';
  const secondaryBtnClass = isDark
    ? 'flex-1 py-2 bg-gray-700 text-white rounded hover:bg-gray-600'
    : 'flex-1 py-2 bg-slate-200 text-slate-900 rounded hover:bg-slate-300';

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    plan: 'free' as 'free' | 'premium' | 'admin',
    durationDays: 30,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await adminFetch(
        `${apiFunctionsBase}/admin/users/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );

      if (response.ok) {
        toast.success('Kullanıcı oluşturuldu!');
        onClose();
      } else {
        const error = await response.json();
        toast.error(`Hata: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Kullanıcı oluşturma başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={modalPanelClass}>
        <h2 className={modalTitleClass}>Yeni Kullanıcı Oluştur</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Kullanıcı adı</label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9_]{3,32}"
              title="Küçük harf, rakam ve alt çizgi; 3–32 karakter"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Şifre</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>İsim</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Plan</label>
            <select
              value={formData.plan}
              onChange={(e) => setFormData({ ...formData, plan: e.target.value as any })}
              className={fieldClass}
            >
              <option value="free">Free (1 oturum, 5 indirme/gün)</option>
              <option value="premium">Premium (3 oturum, sınırsız)</option>
              <option value="admin">Admin (10 oturum, sınırsız)</option>
            </select>
          </div>
          {formData.plan !== 'admin' && (
            <div>
              <label className={labelClass}>Süre (Gün)</label>
              <input
                type="number"
                min="1"
                value={formData.durationDays}
                onChange={(e) => setFormData({ ...formData, durationDays: parseInt(e.target.value) })}
                className={fieldClass}
              />
            </div>
          )}
          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={secondaryBtnClass}
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Downloads Modal Component
function DownloadsModal({ downloads, onClose }: { downloads: any[]; onClose: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const modalPanelClass = isDark
    ? 'bg-gray-800 rounded-lg p-6 w-full max-w-4xl border border-gray-700 max-h-[80vh] overflow-y-auto'
    : 'bg-white rounded-lg p-6 w-full max-w-4xl border border-slate-200 shadow-xl max-h-[80vh] overflow-y-auto';
  const modalTitleClass = isDark ? 'text-xl text-white' : 'text-xl text-slate-900';
  const closeBtnClass = isDark ? 'text-gray-400 hover:text-white' : 'text-slate-500 hover:text-slate-900';
  const cardClass = isDark
    ? 'bg-gray-900 rounded-lg p-4 border border-gray-700'
    : 'bg-slate-50 rounded-lg p-4 border border-slate-200';
  const primaryLineClass = isDark ? 'text-white mb-1' : 'text-slate-900 mb-1';
  const secondaryLineClass = isDark ? 'text-sm text-gray-400' : 'text-sm text-slate-600';
  const metaMutedClass = isDark ? 'text-sm text-gray-400' : 'text-sm text-slate-600';
  const sizeClass = isDark ? 'text-xs text-gray-500' : 'text-xs text-slate-500';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={modalPanelClass}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={modalTitleClass}>İndirme Geçmişi</h2>
          <button type="button" onClick={onClose} className={closeBtnClass}>
            ×
          </button>
        </div>
        
        {downloads.length === 0 ? (
          <div className={isDark ? 'text-center py-12 text-slate-400' : 'text-center py-12 text-slate-500'}>
            İndirme geçmişi bulunamadı
          </div>
        ) : (
          <div className="space-y-2">
            {downloads.map((download, idx) => (
              <div key={idx} className={cardClass}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className={primaryLineClass}>{download.fileName}</div>
                    <div className={secondaryLineClass}>{download.categoryName}</div>
                  </div>
                  <div className="text-right">
                    <div className={metaMutedClass}>
                      {new Date(download.downloadedAt).toLocaleString('tr-TR')}
                    </div>
                    {download.fileSize && (
                      <div className={sizeClass}>
                        {(download.fileSize / 1024 / 1024).toFixed(2)} MB
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
