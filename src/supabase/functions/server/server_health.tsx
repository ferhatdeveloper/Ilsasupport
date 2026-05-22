/**
 * Sunucu CPU / RAM (Windows CIM; di?er platformlarda Deno.systemMemoryInfo).
 */
export type ServerHealthSnapshot = {
  platform: string;
  hostname: string;
  uptimeSeconds: number;
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    usedPercent: number;
  };
  cpu: {
    usagePercent: number | null;
    cores: number | null;
  };
  api: {
    pid: number;
    memoryRssMb: number;
  };
  at: string;
};

let lastCpuSample: { at: number; percent: number } | null = null;

/** Windows PowerShell CIM sorgusu a??r; k?sa �nbellek ile tekrarl? istekleri keser */
let healthCache: { at: number; snapshot: ServerHealthSnapshot } | null = null;
const HEALTH_CACHE_MS = 8000;

async function getWindowsMetrics(): Promise<{
  totalMb: number;
  freeMb: number;
  cpuPercent: number;
} | null> {
  const script = `
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    @{
      totalKb = [int64]$os.TotalVisibleMemorySize
      freeKb = [int64]$os.FreePhysicalMemory
      cpuPercent = [double]$cpu
    } | ConvertTo-Json -Compress
  `;
  try {
    const cmd = new Deno.Command('powershell', {
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      stdout: 'piped',
      stderr: 'null',
    });
    const { code, stdout } = await cmd.output();
    if (code !== 0) return null;
    const text = new TextDecoder().decode(stdout).trim();
    const j = JSON.parse(text) as { totalKb?: number; freeKb?: number; cpuPercent?: number };
    const totalMb = Math.round((Number(j.totalKb) || 0) / 1024);
    const freeMb = Math.round((Number(j.freeKb) || 0) / 1024);
    return {
      totalMb,
      freeMb,
      cpuPercent: Math.min(100, Math.max(0, Number(j.cpuPercent) || 0)),
    };
  } catch (e) {
    console.warn('[server_health] windows metrics:', e);
    return null;
  }
}

export async function getServerHealth(): Promise<ServerHealthSnapshot> {
  if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) {
    return {
      ...healthCache.snapshot,
      at: new Date().toISOString(),
    };
  }

  const memInfo = Deno.systemMemoryInfo();
  let totalMb = Math.round(memInfo.total / 1024 / 1024);
  let freeMb = Math.round(memInfo.free / 1024 / 1024);
  let usedMb = Math.max(0, totalMb - freeMb);
  let usedPercent = totalMb > 0 ? Math.round((usedMb / totalMb) * 1000) / 10 : 0;
  let cpuPercent: number | null = null;

  const win = Deno.build.os === 'windows' ? await getWindowsMetrics() : null;
  if (win) {
    totalMb = win.totalMb;
    freeMb = win.freeMb;
    usedMb = Math.max(0, totalMb - freeMb);
    usedPercent = totalMb > 0 ? Math.round((usedMb / totalMb) * 1000) / 10 : 0;
    cpuPercent = win.cpuPercent;
    lastCpuSample = { at: Date.now(), percent: cpuPercent };
  } else if (lastCpuSample && Date.now() - lastCpuSample.at < 5000) {
    cpuPercent = lastCpuSample.percent;
  }

  let cores: number | null = null;
  try {
    cores = navigator.hardwareConcurrency ?? null;
  } catch {
    cores = null;
  }

  const rss = Deno.memoryUsage().rss;
  const snapshot: ServerHealthSnapshot = {
    platform: Deno.build.os,
    hostname: Deno.hostname(),
    uptimeSeconds: Math.floor(performance.now() / 1000),
    memory: { totalMb, usedMb, freeMb, usedPercent },
    cpu: { usagePercent: cpuPercent, cores },
    api: {
      pid: Deno.pid,
      memoryRssMb: Math.round(rss / 1024 / 1024),
    },
    at: new Date().toISOString(),
  };
  healthCache = { at: Date.now(), snapshot };
  return snapshot;
}
