// Device fingerprinting utility
export function getDeviceId(): string {
  const storageKey = 'ilsa_device_id';
  
  // Check if device ID already exists
  let deviceId = localStorage.getItem(storageKey);
  
  if (!deviceId) {
    // Generate a unique device ID based on browser fingerprint
    deviceId = generateDeviceFingerprint();
    localStorage.setItem(storageKey, deviceId);
  }
  
  return deviceId;
}

function generateDeviceFingerprint(): string {
  // Create a comprehensive fingerprint based on browser/device properties
  const fingerprint: string[] = [];
  
  // 1. Navigator properties
  fingerprint.push(navigator.userAgent);
  fingerprint.push(navigator.language);
  fingerprint.push(navigator.languages?.join(',') || '');
  fingerprint.push(navigator.platform);
  fingerprint.push(navigator.hardwareConcurrency?.toString() || '');
  fingerprint.push(navigator.deviceMemory?.toString() || '');
  fingerprint.push(navigator.maxTouchPoints?.toString() || '');
  
  // 2. Screen properties
  fingerprint.push(screen.colorDepth.toString());
  fingerprint.push(screen.width.toString());
  fingerprint.push(screen.height.toString());
  fingerprint.push(screen.availWidth.toString());
  fingerprint.push(screen.availHeight.toString());
  fingerprint.push(screen.pixelDepth?.toString() || '');
  fingerprint.push(window.devicePixelRatio?.toString() || '');
  
  // 3. Timezone
  fingerprint.push(new Date().getTimezoneOffset().toString());
  fingerprint.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  
  // 4. WebGL fingerprint (GPU info)
  const webglFingerprint = getWebGLFingerprint();
  fingerprint.push(webglFingerprint);
  
  // 5. Canvas fingerprint
  const canvasFingerprint = getCanvasFingerprint();
  fingerprint.push(canvasFingerprint);
  
  // 6. Audio fingerprint
  const audioFingerprint = getAudioFingerprint();
  fingerprint.push(audioFingerprint);
  
  // 7. Fonts detection
  const fontsFingerprint = getFontsFingerprint();
  fingerprint.push(fontsFingerprint);
  
  // 8. Browser features
  fingerprint.push(typeof localStorage !== 'undefined' ? '1' : '0');
  fingerprint.push(typeof sessionStorage !== 'undefined' ? '1' : '0');
  fingerprint.push(typeof indexedDB !== 'undefined' ? '1' : '0');
  fingerprint.push(typeof navigator.cookieEnabled !== 'undefined' && navigator.cookieEnabled ? '1' : '0');
  
  // Combine all fingerprints
  const combinedFingerprint = fingerprint.join('|');
  
  // Generate hash
  return hashString(combinedFingerprint);
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return 'no-canvas';
    
    canvas.width = 200;
    canvas.height = 50;
    
    // Draw complex pattern
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('ILSA Support 🔒', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Device ID', 4, 17);
    
    return canvas.toDataURL();
  } catch (e) {
    return 'canvas-error';
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    
    if (!gl) return 'no-webgl';
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';
    
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    return `${vendor}~${renderer}`;
  } catch (e) {
    return 'webgl-error';
  }
}

function getAudioFingerprint(): string {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return 'no-audio';
    
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const analyser = context.createAnalyser();
    const gainNode = context.createGain();
    const scriptProcessor = context.createScriptProcessor(4096, 1, 1);
    
    gainNode.gain.value = 0; // Mute
    oscillator.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(gainNode);
    gainNode.connect(context.destination);
    
    oscillator.start(0);
    
    const fingerprint = `${context.sampleRate}-${analyser.frequencyBinCount}`;
    
    oscillator.stop();
    context.close();
    
    return fingerprint;
  } catch (e) {
    return 'audio-error';
  }
}

function getFontsFingerprint(): string {
  try {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testFonts = [
      'Arial', 'Verdana', 'Times New Roman', 'Courier New',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Tahoma'
    ];
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-fonts';
    
    const detected: string[] = [];
    
    baseFonts.forEach(baseFont => {
      ctx.font = `72px ${baseFont}`;
      const baseWidth = ctx.measureText('mmmmmmmmmmlli').width;
      
      testFonts.forEach(testFont => {
        ctx.font = `72px ${testFont}, ${baseFont}`;
        const testWidth = ctx.measureText('mmmmmmmmmmlli').width;
        
        if (testWidth !== baseWidth) {
          detected.push(testFont);
        }
      });
    });
    
    return detected.join(',');
  } catch (e) {
    return 'fonts-error';
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Add random component for uniqueness (stored in localStorage)
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  
  return `device_${Math.abs(hash).toString(36)}_${timestamp}_${random}`;
}

export function clearDeviceId(): void {
  localStorage.removeItem('ilsa_device_id');
}

export function getDeviceInfo(): { 
  deviceId: string; 
  userAgent: string; 
  platform: string;
  screen: string;
  timestamp: number;
} {
  return {
    deviceId: getDeviceId(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screen: `${screen.width}x${screen.height}`,
    timestamp: Date.now(),
  };
}