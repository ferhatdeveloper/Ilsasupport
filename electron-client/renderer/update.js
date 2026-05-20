(async () => {
  const info = await window.ilsaDesktop.getUpdateInfo();
  const msg = document.getElementById('update-msg');
  const detail = document.getElementById('version-detail');
  const progress = document.getElementById('update-progress');
  const btnDownload = document.getElementById('btn-download');
  const btnBrowser = document.getElementById('btn-download-browser');

  if (info?.error) {
    msg.textContent = info.error;
  }
  if (info?.clientVersion || info?.requiredVersion || info?.latestVersion) {
    detail.textContent = `Sizin sürüm: ${info.clientVersion || '?'} — Gerekli: ${info.requiredVersion || info.latestVersion || '?'}`;
    detail.hidden = false;
  }

  if (window.ilsaDesktop.onDownloadProgress) {
    window.ilsaDesktop.onDownloadProgress((p) => {
      progress.hidden = false;
      const pct = p.percent != null ? ` %${p.percent}` : '';
      const mb = p.total
        ? `${(p.downloaded / 1024 / 1024).toFixed(1)} / ${(p.total / 1024 / 1024).toFixed(1)} MB`
        : `${(p.downloaded / 1024 / 1024).toFixed(1)} MB`;
      progress.textContent = `İndiriliyor… ${mb}${pct}`;
    });
  }

  btnBrowser.onclick = () => window.ilsaDesktop.openDownloadUrl();

  btnDownload.onclick = async () => {
    btnDownload.disabled = true;
    btnBrowser.disabled = true;
    progress.hidden = false;
    progress.textContent = 'İndirme başlıyor…';
    if (typeof window.ilsaDesktop.downloadUpdate === 'function') {
      const result = await window.ilsaDesktop.downloadUpdate();
      if (result?.success) {
        progress.textContent = `Tamamlandı: ${result.filename || ''}. Klasör açıldı — yeni dosyayı çalıştırın.`;
      } else {
        progress.textContent = result?.error || 'İndirme başarısız';
        await window.ilsaDesktop.openDownloadUrl();
      }
    } else {
      await window.ilsaDesktop.openDownloadUrl();
    }
    btnDownload.disabled = false;
    btnBrowser.disabled = false;
  };
})();
