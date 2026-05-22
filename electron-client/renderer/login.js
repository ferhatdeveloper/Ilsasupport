const $ = (id) => document.getElementById(id);

function showMsg(id, text) {
  const el = $(id);
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

function setTab(tab) {
  const signin = tab === 'signin';
  $('tab-signin').classList.toggle('active', signin);
  $('tab-signup').classList.toggle('active', !signin);
  $('form-signin').hidden = !signin;
  $('form-signup').hidden = signin;
  $('continue-choice').hidden = true;
  document.querySelector('.tabs')?.classList.remove('hidden');
  showMsg('error', '');
  showMsg('success', '');
}

function showContinueChoice(user) {
  $('form-signin').hidden = true;
  document.querySelector('.tabs')?.classList.add('hidden');
  $('continue-choice').hidden = false;
  const appBtn = $('btn-continue-app');
  if (appBtn) appBtn.hidden = true;
  $('btn-continue-browser').hidden = false;
  $('btn-continue-browser').disabled = false;
  $('btn-continue-browser').textContent = 'Tarayıcıdan devam et';
  const name = user?.name || user?.username || 'Hesabınız';
  $('continue-user-line').textContent = `${name} — siteyi tarayıcıda açın`;
}

function setContinueBusy(busy) {
  const appBtn = $('btn-continue-app');
  if (appBtn) appBtn.disabled = busy;
  $('btn-continue-browser').disabled = busy;
}

async function invokeContinue(fn, busyLabel) {
  if (typeof fn !== 'function') {
    return {
      success: false,
      error: 'Bu sürüm güncel değil. Lütfen siteden yeni portable indirin.',
    };
  }
  setContinueBusy(true);
  showMsg('error', '');
  showMsg('success', busyLabel + '…');
  try {
    return await fn();
  } catch (e) {
    console.error('[continue]', e);
    return { success: false, error: e?.message || String(e) };
  } finally {
    setContinueBusy(false);
  }
}

$('tab-signin').onclick = () => setTab('signin');
$('tab-signup').onclick = () => setTab('signup');

function setupOptionalUpdateBanner() {
  const banner = $('update-banner');
  const text = $('update-banner-text');
  const progress = $('update-progress');
  const btnDl = $('btn-update-download');
  const btnLater = $('btn-update-later');
  if (!banner || !window.ilsaDesktop?.onOptionalUpdate) return;

  window.ilsaDesktop.onOptionalUpdate((info) => {
    if (!info?.updateAvailable || info?.updateRequired) return;
    banner.hidden = false;
    text.textContent = `Sizin sürüm: ${info.clientVersion || '?'} → Yeni: ${info.latestVersion || '?'}. İndirilen dosya İndirilenler klasörüne kaydedilir.`;
  });

  if (window.ilsaDesktop.onDownloadProgress) {
    window.ilsaDesktop.onDownloadProgress((p) => {
      progress.hidden = false;
      const pct = p.percent != null ? `%${p.percent}` : '';
      const mb = p.total
        ? `${(p.downloaded / 1024 / 1024).toFixed(1)} / ${(p.total / 1024 / 1024).toFixed(1)} MB`
        : `${(p.downloaded / 1024 / 1024).toFixed(1)} MB`;
      progress.textContent = `İndiriliyor… ${mb} ${pct}`;
    });
  }

  btnLater?.addEventListener('click', () => {
    banner.hidden = true;
  });

  btnDl?.addEventListener('click', async () => {
    if (typeof window.ilsaDesktop.downloadUpdate !== 'function') {
      await window.ilsaDesktop.openDownloadUrl?.();
      return;
    }
    btnDl.disabled = true;
    btnLater.disabled = true;
    progress.hidden = false;
    progress.textContent = 'İndirme başlıyor…';
    const result = await window.ilsaDesktop.downloadUpdate();
    btnDl.disabled = false;
    btnLater.disabled = false;
    if (result?.success) {
      progress.textContent = `Kaydedildi: ${result.filename || result.path}. Eski portable’ı kapatıp bu dosyayı çalıştırın.`;
      showMsg('success', 'Güncelleme indirildi. Yeni dosyayı çalıştırın.');
    } else {
      progress.textContent = result?.error || 'İndirme başarısız';
      showMsg('error', result?.error || 'İndirme başarısız. Tarayıcıda açmayı deneyin.');
      await window.ilsaDesktop.openDownloadUrl?.();
    }
  });
}

setupOptionalUpdateBanner();

(async () => {
  const pref = await window.ilsaDesktop.getRememberPrefill?.();
  if (pref?.username) {
    $('signin-user').value = pref.username;
    if ($('remember-me')) $('remember-me').checked = !!pref.hasRemember;
  }
})();

(async () => {
  const ver = await window.ilsaDesktop.getAppVersion?.();
  const hw = await window.ilsaDesktop.getHardwareId?.();
  const note = document.querySelector('.hw-note');
  if (note) {
    const parts = [];
    if (ver) parts.push(`Sürüm ${ver}`);
    parts.push('Portable ilk açılışta 30–60 sn sürebilir.');
    if (hw) parts.push(`Cihaz ID: ${hw}`);
    note.textContent = parts.join(' — ');
  }
})();

$('form-signin').addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg('error', '');
  showMsg('success', '');
  $('continue-choice').hidden = true;
  const btn = $('btn-signin');
  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor…';

  const rememberMe = !!$('remember-me')?.checked;
  const result = await window.ilsaDesktop.signin({
    username: $('signin-user').value.trim().toLowerCase(),
    password: $('signin-pass').value,
    rememberMe,
  });

  if (result.success && result.needsContinueChoice) {
    if (rememberMe) {
      showMsg('success', 'Site tarayıcıda açılıyor…');
      const cont = await invokeContinue(
        () => window.ilsaDesktop.continueInBrowser(),
        'Tarayıcı',
      );
      if (cont.success) return;
      showMsg('error', cont.error || 'Tarayıcı açılamadı');
      showContinueChoice(result.user);
      btn.disabled = false;
      btn.textContent = 'Giriş yap';
      return;
    }
    showMsg('success', 'Tarayıcıdan devam et ile siteyi açın.');
    showContinueChoice(result.user);
    btn.disabled = true;
    btn.textContent = 'Giriş yapıldı';
    return;
  }

  if (result.success) {
    showMsg('success', 'Site açılıyor…');
    btn.textContent = 'Başarılı';
    return;
  }

  if (result.errorCode === 'UPDATE_REQUIRED') {
    showMsg(
      'error',
      `${result.error || 'Güncelleme gerekli'}${result.requiredVersion ? ` (gerekli: ${result.requiredVersion})` : ''}`,
    );
    if (result.downloadUrl) {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'btn primary';
      a.style.marginTop = '12px';
      a.style.display = 'inline-block';
      a.textContent = 'Yeni portable indir';
      a.onclick = (ev) => {
        ev.preventDefault();
        window.ilsaDesktop.openDownloadUrl?.() || window.open(result.downloadUrl, '_blank');
      };
      $('form-signin').appendChild(a);
    }
    btn.disabled = false;
    btn.textContent = 'Giriş yap';
  } else {
    const detail = result.errorCode ? ` (${result.errorCode})` : '';
    let msg = (result.error || 'Giriş başarısız') + detail;
    if (result.errorCode === 'HARDWARE_MISMATCH' || result.errorCode === 'DEVICE_PENDING_APPROVAL') {
      const hw = await window.ilsaDesktop.getHardwareId?.();
      if (hw) msg += `\n\nYöneticiye iletin: Cihaz ID ${hw}`;
    }
    if (result.errorCode === 'DEVICE_SIGNATURE_INVALID') {
      msg += '\n\nBilgisayar saatini internet saatiyle eşitleyin (Ayarlar → Tarih ve saat).';
    }
    showMsg('error', msg);
    btn.disabled = false;
    btn.textContent = 'Giriş yap';
  }
});

$('btn-continue-browser').addEventListener('click', async () => {
  const result = await invokeContinue(
    () => window.ilsaDesktop.continueInBrowser(),
    'Tarayıcı açılıyor',
  );
  if (result.success) {
    showMsg('error', '');
    showMsg(
      'success',
      result.handoffUrl
        ? `Tarayıcı açıldı. Giriş otomatik tamamlanır (2 dk).\nGerekirse: ${result.handoffUrl}`
        : 'Varsayılan tarayıcınızda site açıldı. Giriş otomatik tamamlanır (2 dk).',
    );
    $('btn-continue-browser').textContent = 'Tarayıcı açıldı';
  } else {
    showMsg('success', '');
    showMsg('error', result.error || 'Tarayıcı açılamadı');
  }
});

$('form-signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg('error', '');
  showMsg('success', '');
  const btn = $('btn-signup');
  btn.disabled = true;
  btn.textContent = 'Kayıt yapılıyor…';

  const result = await window.ilsaDesktop.signup({
    name: $('signup-name').value.trim(),
    username: $('signup-user').value.trim().toLowerCase(),
    password: $('signup-pass').value,
  });

  if (result.success) {
    showMsg('success', result.message || 'Kayıt tamam.');
    setTab('signin');
    $('signin-user').value = $('signup-user').value.trim().toLowerCase();
  } else {
    showMsg('error', result.error || 'Kayıt başarısız');
  }
  btn.disabled = false;
  btn.textContent = 'Kayıt ol';
});
