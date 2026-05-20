import { useState, useEffect } from 'react';
import { Download, Trash2, Search, AlertCircle, FileText } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { authenticatedFetch } from '../utils/secureApi';
import { storeEncryptedToken, removeEncryptedToken } from '../utils/tokenCrypto';
import { startDownloadFromPreparePayload } from '../utils/startPreparedDownload';

interface DashboardProps {
  user: any;
  accessToken: string;
  onSignOut: () => void;
}

interface File {
  id: string;
  name: string;
  description: string;
  fileType: string;
  createdAt: string;
}

export function Dashboard({ user, accessToken, onSignOut }: DashboardProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const response = await fetch(
        `${apiFunctionsBase}/files`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Dosya yükleme hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      setDownloadingFiles(prev => new Set(prev).add(fileId));

      // Download token oluştur
      const response = await authenticatedFetch(
        `${apiFunctionsBase}/request-download?fileId=${fileId}`,
        { method: 'POST' },
        accessToken,
      );

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'İndirme başarısız');
        return;
      }

      const data = await response.json();
      console.log(`🔑 Download token received: ${data.downloadToken}`);

      if (data.useDirectDownload && startDownloadFromPreparePayload(data)) {
        storeEncryptedToken(fileId, data.downloadToken);
        localStorage.setItem(`download_token_${fileId}_timestamp`, Date.now().toString());
        setTimeout(() => {
          removeEncryptedToken(fileId);
          localStorage.removeItem(`download_token_${fileId}_timestamp`);
        }, 30000);
        return;
      }

      // 🔄 FALLBACK: Eski proxy yöntemi
      // 🔐 Token'ı şifreli olarak localStorage'e kaydet
      storeEncryptedToken(fileId, data.downloadToken);
      localStorage.setItem(`download_token_${fileId}_timestamp`, Date.now().toString());
      console.log(`💾 Token localStorage'e kaydedildi: ${fileId}`);

      // ✅ Token ile dosyayı fetch et (blob olarak)
      const downloadUrl = `${apiFunctionsBase}/download/${data.downloadToken}`;
      
      console.log(`📥 Fetching file from: ${downloadUrl}`);
      const fileResponse = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!fileResponse.ok) {
        let errorMessage = 'Dosya indirme başarısız';
        try {
          const error = await fileResponse.json();
          console.error('❌ Download error:', error);
          errorMessage = error.error || errorMessage;
          if (error.details) {
            console.error('❌ Error details:', error.details);
          }
          if (error.status) {
            console.error('❌ Google Drive status:', error.status);
          }
        } catch (e) {
          console.error('❌ Could not parse error response');
        }
        alert(errorMessage);
        // ❌ Hata durumunda token'ı temizle
        removeEncryptedToken(fileId);
        return;
      }

      // Blob olarak al
      const blob = await fileResponse.blob();
      console.log(`✅ File blob received: ${blob.size} bytes`);

      // Blob URL oluştur ve indir
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = data.fileName || fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Blob URL'i temizle
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

      // 🧹 İndirme başarılı - token'ı localStorage'den temizle
      removeEncryptedToken(fileId);
      localStorage.removeItem(`download_token_${fileId}_timestamp`);
      console.log(`🧹 Token localStorage'den temizlendi: ${fileId}`);

      console.log(`✅ İndirme başlatıldı: ${data.fileName}`);
    } catch (error) {
      console.error('İndirme hatası:', error);
      alert('Bir hata oluştu');
    } finally {
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
    }
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-gray-900">Dosya Yönetim Sistemi</h1>
              <p className="text-gray-600 mt-1">Hoş geldiniz, {user.name}</p>
            </div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Dosya ara..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Files Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-gray-600">Dosyalar yükleniyor...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {searchTerm ? 'Arama sonucu bulunamadı' : 'Henüz dosya yok'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-gray-900 truncate mb-1">
                      {file.name}
                    </h3>
                    {file.description && (
                      <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                        {file.description}
                      </p>
                    )}
                    <p className="text-gray-500 text-xs">
                      {new Date(file.createdAt).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(file.id, file.name)}
                  disabled={downloadingFiles.has(file.id)}
                  className="download-action-btn mt-4 w-full py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {downloadingFiles.has(file.id) ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      İndiriliyor...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      İndir
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}