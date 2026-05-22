/**
 * Arka plan iş kuyruğu — RabbitMQ (RABBITMQ_URL) veya bellek içi toplu yazma.
 */
import amqp from 'npm:amqplib@0.10.4';

const QUEUE_NAME = (Deno.env.get('RABBITMQ_QUEUE') || 'ilsa.background').trim();

type Job = { type: string; payload: Record<string, unknown>; at: number };

let amqpChannel: amqp.Channel | null = null;
let amqpConnecting: Promise<amqp.Channel | null> | null = null;
let consumerStarted = false;
let reconnectTimer: ReturnType<typeof setInterval> | null = null;

const memQueue: Job[] = [];
let memDrainScheduled = false;
const handlers = new Map<string, (payload: Record<string, unknown>) => Promise<void>>();

export function registerQueueHandler(
  type: string,
  fn: (payload: Record<string, unknown>) => Promise<void>,
): void {
  handlers.set(type, fn);
}

function dropAmqpChannel(): void {
  amqpChannel = null;
  consumerStarted = false;
}

async function getAmqpChannel(): Promise<amqp.Channel | null> {
  const url = (Deno.env.get('RABBITMQ_URL') || '').trim();
  if (!url) return null;
  if (amqpChannel) return amqpChannel;
  if (amqpConnecting) return amqpConnecting;
  amqpConnecting = (async () => {
    try {
      const conn = await amqp.connect(url);
      const ch = await conn.createChannel();
      await ch.assertQueue(QUEUE_NAME, { durable: true });
      conn.on('error', () => {
        dropAmqpChannel();
      });
      conn.on('close', () => {
        dropAmqpChannel();
      });
      ch.on('error', () => {
        dropAmqpChannel();
      });
      ch.on('close', () => {
        dropAmqpChannel();
      });
      amqpChannel = ch;
      await consumeAmqp(ch);
      console.log('[queue] RabbitMQ baglandi:', QUEUE_NAME);
      return ch;
    } catch (e) {
      console.warn('[queue] RabbitMQ baglanamadi, bellek kuyrugu:', e);
      dropAmqpChannel();
      return null;
    } finally {
      amqpConnecting = null;
    }
  })();
  return amqpConnecting;
}

async function consumeAmqp(ch: amqp.Channel): Promise<void> {
  await ch.consume(QUEUE_NAME, (msg) => {
    if (!msg) return;
    void (async () => {
      try {
        const job = JSON.parse(msg.content.toString()) as Job;
        const fn = handlers.get(job.type);
        if (fn) await fn(job.payload);
        ch.ack(msg);
      } catch (e) {
        console.warn('[queue] consume error:', e);
        ch.nack(msg, false, false);
      }
    })();
  });
  consumerStarted = true;
}

function scheduleMemDrain(): void {
  if (memDrainScheduled) return;
  memDrainScheduled = true;
  setTimeout(() => {
    memDrainScheduled = false;
    void drainMemQueue();
  }, 150);
}

async function drainMemQueue(): Promise<void> {
  if (memQueue.length === 0) return;
  const batch = memQueue.splice(0, Math.min(200, memQueue.length));
  const byType = new Map<string, Record<string, unknown>[]>();
  for (const j of batch) {
    const arr = byType.get(j.type) || [];
    arr.push(j.payload);
    byType.set(j.type, arr);
  }
  for (const [type, payloads] of byType) {
    const fn = handlers.get(type);
    if (!fn) continue;
    for (const p of payloads) {
      try {
        await fn(p);
      } catch (e) {
        console.warn(`[queue] handler ${type}:`, e);
      }
    }
  }
  if (memQueue.length > 0) scheduleMemDrain();
}

/** Boot + periyodik yeniden bağlanma (lazy consumer kopmasını önler) */
export async function initMessageQueue(): Promise<void> {
  const url = (Deno.env.get('RABBITMQ_URL') || '').trim();
  if (!url) return;
  await getAmqpChannel();
  if (reconnectTimer != null) return;
  reconnectTimer = setInterval(() => {
    if (!url) return;
    if (!amqpChannel && !amqpConnecting) void getAmqpChannel();
  }, 30_000);
}

export type QueueHealth = {
  configured: boolean;
  connected: boolean;
  consumerActive: boolean;
  mode: 'rabbitmq' | 'rabbitmq-degraded' | 'memory';
  pendingMemoryJobs: number;
};

export function getQueueHealth(): QueueHealth {
  const configured = !!(Deno.env.get('RABBITMQ_URL') || '').trim();
  const connected = !!amqpChannel;
  const consumerActive = connected && consumerStarted;
  let mode: QueueHealth['mode'] = 'memory';
  if (configured) {
    mode = connected ? 'rabbitmq' : 'rabbitmq-degraded';
  }
  return {
    configured,
    connected,
    consumerActive,
    mode,
    pendingMemoryJobs: memQueue.length,
  };
}

/** İşi kuyruğa ekle — ana istek beklemez */
export function enqueue(type: string, payload: Record<string, unknown>): void {
  const job: Job = { type, payload, at: Date.now() };
  void (async () => {
    const ch = await getAmqpChannel();
    if (ch) {
      try {
        ch.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(job)), { persistent: true });
        return;
      } catch (e) {
        console.warn('[queue] publish failed:', e);
        dropAmqpChannel();
      }
    }
    memQueue.push(job);
    if (memQueue.length >= 100) void drainMemQueue();
    else scheduleMemDrain();
  })();
}

export function queueBackend(): 'rabbitmq' | 'memory' {
  return (Deno.env.get('RABBITMQ_URL') || '').trim() ? 'rabbitmq' : 'memory';
}
