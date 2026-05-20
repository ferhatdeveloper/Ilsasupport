import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import os from 'node:os';

function parseEnvPort(value: string | undefined, fallback: number): number {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
}

/** 10/172.16-31/192.168 dışı IPv4 (VPS genel adresi) */
function isRfc1918IPv4(addr: string): boolean {
  if (addr.startsWith('10.')) return true;
  if (addr.startsWith('192.168.')) return true;
  const m = /^172\.(\d+)\./.exec(addr);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

/** VITE_HMR_HOST yoksa: önce genel IPv4, yoksa ilk özel IPv4 — uzaktan IP ile HMR için */
function resolveAutoHmrHost(): string {
  const nets = os.networkInterfaces();
  const v4: string[] = [];
  for (const key of Object.keys(nets)) {
    for (const net of nets[key] || []) {
      if (net && net.family === 'IPv4' && !net.internal) {
        v4.push(net.address);
      }
    }
  }
  const pub = v4.find((a) => !isRfc1918IPv4(a));
  return (pub || v4[0] || '').trim();
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  /** Geliştirme varsayılan portu 80; yönetici / meşgul port için .env.local → VITE_DEV_PORT=5173 */
  const devPort = parseEnvPort(env.VITE_DEV_PORT, 80);
  /** 80’de kalmalı: varsayılan strict. Gevşetmek (meşgulse sıradaki port): VITE_DEV_STRICT_PORT=0 */
  const strictDev = (env.VITE_DEV_STRICT_PORT || '').trim() !== '0';

  /**
   * Dış IP ile HMR: yalnızca VITE_AUTO_HMR_HOST=1 veya VITE_HMR_HOST / VITE_PUBLIC_DEV_HOST.
   * Eski varsayılan (otomatik dış IP) localhost’ta WS’yi yanlış hosta yönlendiriyordu → 426 / sayfa açılmıyor.
   */
  const autoHmrHost = (env.VITE_AUTO_HMR_HOST || '').trim() === '1';
  const envHmr = (env.VITE_HMR_HOST || env.VITE_PUBLIC_DEV_HOST || '').trim();
  const hmrHost = envHmr || (autoHmrHost ? resolveAutoHmrHost() : '');
  const hmrProtocol =
    (env.VITE_HMR_PROTOCOL || 'ws').trim().toLowerCase() === 'wss' ? ('wss' as const) : ('ws' as const);
  const hmrClientPort = parseEnvPort(env.VITE_HMR_CLIENT_PORT, 0);
  const hmrDisabled = (env.VITE_DISABLE_HMR || '').trim() === '1';

  /** WS varsayılan olarak sayfa ile aynı origin (host/port); TLS proxy: wss + clientPort */
  function buildHmr(): boolean | { host?: string; protocol: 'ws' | 'wss'; clientPort?: number } {
    const hasHost = Boolean(hmrHost);
    const hasClientPort = hmrClientPort > 0;
    if (hmrProtocol === 'ws' && !hasHost && !hasClientPort) return true;
    const cfg: { host?: string; protocol: 'ws' | 'wss'; clientPort?: number } = { protocol: hmrProtocol };
    if (hasHost) cfg.host = hmrHost;
    if (hasClientPort) cfg.clientPort = hmrClientPort;
    return cfg;
  }

  const hmrConfig = hmrDisabled ? false : buildHmr();

  return {
    /** Port 80 / bind hatalarini konsolda gormek icin */
    clearScreen: false,
    plugins: [react()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        'vaul@1.1.2': 'vaul',
        'sonner@2.0.3': 'sonner',
        'recharts@2.15.2': 'recharts',
        'react-resizable-panels@2.1.7': 'react-resizable-panels',
        'react-hook-form@7.55.0': 'react-hook-form',
        'react-day-picker@8.10.1': 'react-day-picker',
        'next-themes@0.4.6': 'next-themes',
        'lucide-react@0.487.0': 'lucide-react',
        'input-otp@1.4.2': 'input-otp',
        'figma:asset/a39c89d3bf8d45a443edabd6e48c9353fd998385.png': path.resolve(__dirname, './src/assets/a39c89d3bf8d45a443edabd6e48c9353fd998385.png'),
        'embla-carousel-react@8.6.0': 'embla-carousel-react',
        'cmdk@1.1.1': 'cmdk',
        'class-variance-authority@0.7.1': 'class-variance-authority',
        '@supabase/supabase-js@2': '@supabase/supabase-js',
        '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
        '@radix-ui/react-toggle@1.1.2': '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group@1.1.2': '@radix-ui/react-toggle-group',
        '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
        '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
        '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
        '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
        '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
        '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
        '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
        '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
        '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
        '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
        '@radix-ui/react-navigation-menu@1.2.5': '@radix-ui/react-navigation-menu',
        '@radix-ui/react-menubar@1.1.6': '@radix-ui/react-menubar',
        '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
        '@radix-ui/react-hover-card@1.1.6': '@radix-ui/react-hover-card',
        '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
        '@radix-ui/react-context-menu@2.2.6': '@radix-ui/react-context-menu',
        '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
        '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
        '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
        '@radix-ui/react-aspect-ratio@1.1.2': '@radix-ui/react-aspect-ratio',
        '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
        '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
        '@jsr/supabase__supabase-js@2.49.8': '@jsr/supabase__supabase-js',
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'build',
    },
    /** `npm run build` sonrası `npm run preview:lan` — HMR yok, dış IP ile daha sorunsuz */
    preview: {
      port: 80,
      strictPort: true,
      /** true: tüm arayüzler + Vite konsolda LAN URL’leri (dış IP ile erişim) */
      host: true,
      allowedHosts: true,
      open: false,
      proxy: {
        '/make-server-47081311': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    server: {
      port: devPort,
      /** Varsayılan true (port 80 sabit). Meşgul portta Vite’ın başka porta geçmesi için: VITE_DEV_STRICT_PORT=0 */
      strictPort: strictDev,
      /** true: 0.0.0.0 benzeri — dış IP’den HTTP; konsolda Network: http://x.x.x.x/ */
      host: true,
      /** Host başlığı sunucu IP’si veya alan adı olduğunda Vite 6 güvenlik denetimi */
      allowedHosts: true,
      /** SSH/sunucuda tarayıcı açma; istemci makineden IP ile girilir */
      open: false,
      hmr: hmrConfig,
      // Geliştirmede tarayıcıdan /make-server-47081311/* → yerel Deno (PORT veya 8787); dış IP’de aynı origin üzerinden Vite proxy
      proxy: {
        '/make-server-47081311': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});