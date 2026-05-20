// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}-tab`).classList.add('active');

  // Clear errors
  hideError('signin-error');
  hideError('signup-error');
  hideSuccess('signup-success');
}

// Error handling
function showError(elementId, message) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.classList.add('show');
}

function hideError(elementId) {
  const element = document.getElementById(elementId);
  element.classList.remove('show');
}

function showSuccess(elementId, message) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.classList.add('show');
}

function hideSuccess(elementId) {
  const element = document.getElementById(elementId);
  element.classList.remove('show');
}

// Sign In Form
document.getElementById('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('signin-error');

  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const btn = document.getElementById('signin-btn');

  // Validation
  if (!email || !password) {
    showError('signin-error', 'Tüm alanları doldurun');
    return;
  }

  // Disable button
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Giriş yapılıyor...';

  try {
    const result = await window.electronAPI.signin({ email, password });

    if (result.success) {
      btn.innerHTML = '✓ Başarılı! Browser açılıyor...';
      // Window will close automatically when browser opens
    } else {
      showError('signin-error', result.error || 'Giriş başarısız');
      btn.disabled = false;
      btn.innerHTML = 'Giriş Yap';
    }
  } catch (error) {
    console.error('Sign in error:', error);
    showError('signin-error', 'Bir hata oluştu. Lütfen tekrar deneyin.');
    btn.disabled = false;
    btn.innerHTML = 'Giriş Yap';
  }
});

// Sign Up Form
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('signup-error');
  hideSuccess('signup-success');

  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const btn = document.getElementById('signup-btn');

  // Validation
  if (!name || !email || !password) {
    showError('signup-error', 'Tüm alanları doldurun');
    return;
  }

  if (password.length < 8) {
    showError('signup-error', 'Şifre en az 8 karakter olmalı');
    return;
  }

  // Disable button
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Kayıt yapılıyor...';

  try {
    const result = await window.electronAPI.signup({ name, email, password });

    if (result.success) {
      showSuccess('signup-success', result.message);
      btn.innerHTML = '✓ Kayıt Başarılı';
      
      // Clear form
      document.getElementById('signup-form').reset();
      
      // Switch to signin tab after 2 seconds
      setTimeout(() => {
        document.querySelector('.tab').click();
        document.getElementById('signin-email').value = email;
      }, 2000);
    } else {
      showError('signup-error', result.error || 'Kayıt başarısız');
      btn.disabled = false;
      btn.innerHTML = 'Kayıt Ol';
    }
  } catch (error) {
    console.error('Sign up error:', error);
    showError('signup-error', 'Bir hata oluştu. Lütfen tekrar deneyin.');
    btn.disabled = false;
    btn.innerHTML = 'Kayıt Ol';
  }
});

// Open Support Window
async function openSupport() {
  try {
    const result = await window.electronAPI.openSupportWindow();
    if (!result.success) {
      showError('signin-error', result.error || 'Destek penceresi açılamadı');
    }
  } catch (error) {
    console.error('Support window error:', error);
    showError('signin-error', 'Destek penceresi açılamadı');
  }
}

// Load Hardware ID
async function loadHardwareId() {
  try {
    const hardwareId = await window.electronAPI.getHardwareId();
    document.getElementById('hardware-info').innerHTML = 
      `<strong>Cihaz ID:</strong> ${hardwareId.substring(0, 16)}...`;
  } catch (error) {
    console.error('Hardware ID error:', error);
    document.getElementById('hardware-info').innerHTML = 
      '<strong>Cihaz ID:</strong> Alınamadı';
  }
}

// Initialize
loadHardwareId();

// Demo credentials helper (for development)
if (window.location.search.includes('demo')) {
  document.getElementById('signin-email').value = 'admin@ilsasupport.com';
  document.getElementById('signin-password').value = 'Admin123456!';
}
