import { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, HardDrive, Activity, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';

const MSG_LOAD_FAIL = 'Sunucu durumu al\u0131namad\u0131.';
const TITLE = 'Sunucu durumu (CPU / RAM)';
const LOADING = 'Y\u00fckleniyor...';
const FREE_RAM = 'Bo\u015f:';
const API_PROC = 'API s\u00fcreci:';
const CORE = '\u00e7ekirdek';
const BTN_SHOW = 'Sunucu durumunu g\u00f6ster';
const BTN_REFRESH = 'Yenile';
const BTN_HIDE = 'Gizle';
const HINT =
  'Canl\u0131 izleme kapal\u0131; her yenilemede sunucuda PowerShell \u00e7al\u0131\u015f\u0131r. Performans i\u00e7in yaln\u0131zca gerekti\u011finde kullan\u0131n.';

type Health = {
  hostname: string;
  memory: { totalMb: number; usedMb: number; freeMb: number; usedPercent: number };
  cpu: { usagePercent: number | null; cores: number | null };
  api: { pid: number; memoryRssMb: number };
  at: string;
};

function barColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 75) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function AdminServerHealth() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/server-health`);
      if (!res.ok) {
        if (mountedRef.current) setError(`HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      if (mountedRef.current) {
        setHealth(data.health);
        setError(null);
      }
    } catch {
      if (mountedRef.current) setError(MSG_LOAD_FAIL);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const handleShow = () => {
    setOpen(true);
    if (!health && !loading) void fetchHealth();
  };

  const handleHide = () => {
    setOpen(false);
  };

  const mem = health?.memory;
  const cpu = health?.cpu?.usagePercent ?? null;

  if (!open) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-gray-300">
          <Activity className="w-5 h-5 text-green-400 shrink-0" />
          <span className="text-sm">{TITLE}</span>
          <span className="text-xs text-gray-500 hidden sm:inline">{'\u2014'} {HINT}</span>
        </div>
        <button
          type="button"
          onClick={handleShow}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium"
        >
          <ChevronDown className="w-4 h-4" />
          {BTN_SHOW}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-lg text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-400" />
          {TITLE}
        </h3>
        <div className="flex items-center gap-2">
          {health?.at && (
            <span className="text-xs text-gray-500 mr-1">
              {new Date(health.at).toLocaleTimeString('tr-TR')} {'\u00b7'} {health.hostname}
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchHealth()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {BTN_REFRESH}
          </button>
          <button
            type="button"
            onClick={handleHide}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm"
          >
            <ChevronUp className="w-4 h-4" />
            {BTN_HIDE}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-4">{HINT}</p>

      {error && <p className="text-red-300 text-sm mb-3">{error}</p>}

      {loading && !health && <p className="text-gray-500 text-sm">{LOADING}</p>}

      {health && mem && (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${loading ? 'opacity-60' : ''}`}>
          <div>
            <div className="flex items-center gap-2 text-gray-300 mb-2">
              <HardDrive className="w-4 h-4 text-blue-400" />
              <span>RAM</span>
              <span className="ml-auto text-white font-mono text-sm">
                {mem.usedMb} / {mem.totalMb} MB ({mem.usedPercent}%)
              </span>
            </div>
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${barColor(mem.usedPercent)}`}
                style={{ width: `${Math.min(100, mem.usedPercent)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {FREE_RAM} {mem.freeMb} MB
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 text-gray-300 mb-2">
              <Cpu className="w-4 h-4 text-orange-400" />
              <span>CPU</span>
              <span className="ml-auto text-white font-mono text-sm">
                {cpu != null ? `${cpu}%` : '\u2014'}
                {health.cpu.cores != null ? ` \u00b7 ${health.cpu.cores} ${CORE}` : ''}
              </span>
            </div>
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${cpu != null ? barColor(cpu) : 'bg-gray-600'}`}
                style={{ width: `${cpu != null ? Math.min(100, cpu) : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {API_PROC} PID {health.api.pid}, ~{health.api.memoryRssMb} MB RSS
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
