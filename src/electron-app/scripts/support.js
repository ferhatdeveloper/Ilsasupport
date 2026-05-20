let supportData = null;
let pollingInterval = null;

// Load support ID
async function loadSupportId() {
  try {
    const result = await window.electronAPI.getSupportId();
    
    if (result.success) {
      supportData = result;
      document.getElementById('support-id').textContent = result.supportId;
      document.getElementById('user-name').textContent = result.name || '-';
      document.getElementById('user-email').textContent = result.email || '-';
      
      // Polling başlat
      startPolling();
    } else {
      updateStatus('error', 'Hata: ' + (result.error || 'Bilgiler yüklenemedi'));
    }
  } catch (error) {
    console.error('Support ID error:', error);
    updateStatus('error', 'Destek bilgileri yüklenemedi');
  }
}

// Polling başlat
function startPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  // Her 3 saniyede bir destek talebini kontrol et
  pollingInterval = setInterval(async () => {
    if (!supportData?.supportId) return;
    
    try {
      const response = await fetch(
        `https://rleiiezkvhrzmbccqock.supabase.co/functions/v1/make-server-47081311/check-support-request?supportId=${supportData.supportId}`
      );
      
      const data = await response.json();
      
      if (data.hasRequest && data.request) {
        if (data.request.status === 'pending') {
          updateStatus('waiting', `⏳ ${data.request.supporterName || 'Destek ekibi'} bağlantı talep ediyor...`);
        } else if (data.request.status === 'approved') {
          updateStatus('active', '✓ Destek bağlantısı onaylandı!');
          stopPolling();
        } else if (data.request.status === 'rejected') {
          updateStatus('waiting', 'Destek talebi reddedildi');
          stopPolling();
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 3000);
}

// Polling durdur
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Copy to clipboard
function copyToClipboard() {
  const supportId = document.getElementById('support-id').textContent;
  
  if (supportId && supportId !== 'YÜKLENIYOR...') {
    navigator.clipboard.writeText(supportId).then(() => {
      showToast('Destek ID kopyalandı!');
    }).catch(err => {
      console.error('Copy error:', err);
      showToast('Kopyalama başarısız');
    });
  }
}

// Show toast notification
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// Update status
function updateStatus(type, message) {
  const statusBox = document.getElementById('status-box');
  const statusText = document.getElementById('status-text');
  
  // Remove all status classes
  statusBox.classList.remove('waiting', 'active', 'error');
  
  // Add new status class
  statusBox.classList.add(type);
  
  // Update text
  statusText.textContent = message;
}

// Listen for support messages
window.electronAPI.onSupportMessage((message) => {
  console.log('Support message received:', message);
  
  if (message.type === 'support-connected') {
    updateStatus('active', '✓ Destek bağlantısı kuruldu');
  } else if (message.type === 'support-disconnected') {
    updateStatus('waiting', 'Destek bağlantısı kesildi');
  } else if (message.type === 'support-request') {
    updateStatus('waiting', '⏳ Bağlantı talebi alındı, onay bekleniyor...');
  }
});

// Listen for support granted
window.electronAPI.onSupportGranted((data) => {
  console.log('Support granted:', data);
  updateStatus('active', data.message || 'Uzaktan destek başlatıldı');
});

// Listen for support errors
window.electronAPI.onSupportError((error) => {
  console.error('Support error:', error);
  updateStatus('error', 'Hata: ' + error);
});

// Close window
function closeWindow() {
  window.electronAPI.closeSupport();
}

// Initialize
loadSupportId();

// Cleanup on close
window.addEventListener('beforeunload', () => {
  stopPolling();
  window.electronAPI.removeAllListeners('support-message');
  window.electronAPI.removeAllListeners('support-granted');
  window.electronAPI.removeAllListeners('support-error');
});