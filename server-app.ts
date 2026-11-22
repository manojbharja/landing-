import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response, NextFunction, Express } from 'express';

export interface GameRateItem {
  id: string;
  game: string;
  rate: string;
}

export interface SiteConfig {
  appName: string;
  shortName: string;
  tagline: string;
  description: string;
  rating: string;
  websiteUrl: string;
  apkUrl: string;
  apkButtonLabel: string;
  logoUrl: string;
  icon192Url: string;
  icon512Url: string;
  icon512MaskableUrl: string;
  whatsappNumber: string;
  whatsappMessage: string;
  metaPixelId: string;
  metaCapiAccessToken: string;
  metaTestEventCode: string;
  hasCapiConfigured?: boolean;
  trackPageViewOnLoad: boolean;
  themeColor: string;
  backgroundColor: string;
  gameRates: GameRateItem[];
  updatedAt: string;
  storageMode?: 'disk' | 'redis' | 'vercel-tmp';
}

interface MetaClientContext {
  clientIp: string;
  userAgent: string;
  fbp: string;
  fbc: string;
  eventSourceUrl: string;
}

interface DownloadEventRecord {
  id: string;
  mode: 'apk' | 'pwa';
  status: 'clicked' | 'downloading' | 'completed' | 'aborted';
  clickedAt: string;
  completedAt: string | null;
  bytesSent: number;
  totalBytes: number;
  capiStatus?: 'pending' | 'sent' | 'error' | 'skipped';
  capiDetail?: string;
}

interface AnalyticsStore {
  buttonClicks: number;
  realDownloads: number;
  apkDownloads: number;
  pwaInstalls: number;
  lastClickAt: string | null;
  lastDownloadAt: string | null;
  recentEvents: DownloadEventRecord[];
}

interface AdminAuthStore {
  salt: string;
  passwordHash: string;
  tokenSecret: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

function resolveWritableDataDir(): string {
  const localDir = path.resolve(__dirname, 'data');
  if (!IS_VERCEL) {
    try {
      fs.mkdirSync(localDir, { recursive: true });
      fs.accessSync(localDir, fs.constants.W_OK);
      return localDir;
    } catch {
      // Fallback to tmp if read-only filesystem
    }
  }
  const tmpDir = path.join(os.tmpdir(), 'shant-matka-data');
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

const DATA_DIR = resolveWritableDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CONFIG_PATH = path.join(DATA_DIR, 'site-config.json');
const AUTH_PATH = path.join(DATA_DIR, 'admin-auth.json');
const ANALYTICS_PATH = path.join(DATA_DIR, 'analytics.json');

// Optional Upstash / Vercel KV REST API support for permanent persistence on Vercel
const REDIS_URL = (
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  ''
).trim();
const REDIS_TOKEN = (
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  ''
).trim();
const HAS_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

const STORAGE_MODE: 'disk' | 'redis' | 'vercel-tmp' = HAS_REDIS
  ? 'redis'
  : IS_VERCEL
  ? 'vercel-tmp'
  : 'disk';

const pendingContexts = new Map<string, MetaClientContext>();

function buildInitialConfig(): SiteConfig {
  return {
    appName: (process.env.APP_NAME || '').trim() || 'SHANT MATKA',
    shortName: (process.env.SHORT_NAME || '').trim() || 'SHANT MATKA',
    tagline: 'Official VIP Android App',
    description:
      'Fast, full-screen access to new.rajagamevip.site directly from your Android home screen.',
    rating: '5.0',
    websiteUrl: (process.env.WEBSITE_URL || '').trim() || 'https://new.rajagamevip.site/',
    apkUrl: (process.env.APK_URL || '').trim() || '',
    apkButtonLabel: (process.env.APK_BUTTON_LABEL || '').trim() || 'Install SHANT MATKA App',
    logoUrl: '/icons/icon-192.png',
    icon192Url: '/icons/icon-192.png',
    icon512Url: '/icons/icon-512.png',
    icon512MaskableUrl: '/icons/icon-512-maskable.png',
    whatsappNumber: (process.env.WHATSAPP_NUMBER || '').trim() || '',
    whatsappMessage: 'Hello SHANT MATKA Support',
    metaPixelId: (process.env.META_PIXEL_ID || '').trim() || '',
    metaCapiAccessToken: (process.env.META_CAPI_ACCESS_TOKEN || '').trim() || '',
    metaTestEventCode: (process.env.META_TEST_EVENT_CODE || '').trim() || '',
    hasCapiConfigured: Boolean((process.env.META_CAPI_ACCESS_TOKEN || '').trim()),
    trackPageViewOnLoad: false,
    themeColor: '#8B0000',
    backgroundColor: '#120000',
    gameRates: [
      { id: 'single-digit', game: 'Single Digit', rate: '10 - 100' },
      { id: 'jodi-digit', game: 'Jodi Digit', rate: '10 - 1000' },
      { id: 'single-panna', game: 'Single Panna', rate: '10 - 1500' },
      { id: 'double-panna', game: 'Double Panna', rate: '10 - 3000' },
      { id: 'triple-panna', game: 'Triple Panna', rate: '10 - 7000' },
      { id: 'half-sangam', game: 'Half Sangam', rate: '10 - 10000' },
      { id: 'full-sangam', game: 'Full Sangam', rate: '10 - 100000' },
    ],
    updatedAt: new Date().toISOString(),
    storageMode: STORAGE_MODE,
  };
}

const DEFAULT_CONFIG: SiteConfig = buildInitialConfig();

const EMPTY_ANALYTICS: AnalyticsStore = {
  buttonClicks: 0,
  realDownloads: 0,
  apkDownloads: 0,
  pwaInstalls: 0,
  lastClickAt: null,
  lastDownloadAt: null,
  recentEvents: [],
};

function ensureStorageDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function redisGetJson<T>(key: string): Promise<T | null> {
  if (!HAS_REDIS) return null;
  try {
    const res = await fetch(`${REDIS_URL.replace(/\/$/, '')}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data.result) return null;
    return JSON.parse(data.result) as T;
  } catch {
    return null;
  }
}

async function redisSetJson(key: string, value: unknown): Promise<void> {
  if (!HAS_REDIS) return;
  try {
    await fetch(`${REDIS_URL.replace(/\/$/, '')}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(JSON.stringify(value)),
    });
  } catch {
    // Fallback file cache still persists locally
  }
}

async function readAnalytics(): Promise<AnalyticsStore> {
  ensureStorageDirs();
  if (HAS_REDIS) {
    const remote = await redisGetJson<Partial<AnalyticsStore>>('shant_matka:analytics');
    if (remote) {
      return {
        buttonClicks: typeof remote.buttonClicks === 'number' ? remote.buttonClicks : 0,
        realDownloads: typeof remote.realDownloads === 'number' ? remote.realDownloads : 0,
        apkDownloads: typeof remote.apkDownloads === 'number' ? remote.apkDownloads : 0,
        pwaInstalls: typeof remote.pwaInstalls === 'number' ? remote.pwaInstalls : 0,
        lastClickAt: typeof remote.lastClickAt === 'string' ? remote.lastClickAt : null,
        lastDownloadAt: typeof remote.lastDownloadAt === 'string' ? remote.lastDownloadAt : null,
        recentEvents: Array.isArray(remote.recentEvents) ? remote.recentEvents : [],
      };
    }
  }
  if (!fs.existsSync(ANALYTICS_PATH)) {
    fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(EMPTY_ANALYTICS, null, 2), 'utf8');
    return { ...EMPTY_ANALYTICS, recentEvents: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(ANALYTICS_PATH, 'utf8')) as Partial<AnalyticsStore>;
    return {
      buttonClicks: typeof raw.buttonClicks === 'number' ? raw.buttonClicks : 0,
      realDownloads: typeof raw.realDownloads === 'number' ? raw.realDownloads : 0,
      apkDownloads: typeof raw.apkDownloads === 'number' ? raw.apkDownloads : 0,
      pwaInstalls: typeof raw.pwaInstalls === 'number' ? raw.pwaInstalls : 0,
      lastClickAt: typeof raw.lastClickAt === 'string' ? raw.lastClickAt : null,
      lastDownloadAt: typeof raw.lastDownloadAt === 'string' ? raw.lastDownloadAt : null,
      recentEvents: Array.isArray(raw.recentEvents) ? raw.recentEvents : [],
    };
  } catch {
    return { ...EMPTY_ANALYTICS, recentEvents: [] };
  }
}

async function writeAnalytics(store: AnalyticsStore): Promise<AnalyticsStore> {
  ensureStorageDirs();
  const trimmed: AnalyticsStore = {
    ...store,
    recentEvents: store.recentEvents.slice(0, 50),
  };
  fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  if (HAS_REDIS) {
    await redisSetJson('shant_matka:analytics', trimmed);
  }
  return trimmed;
}

function upsertEventRecord(
  store: AnalyticsStore,
  id: string,
  updater: (existing: DownloadEventRecord | undefined) => DownloadEventRecord
): DownloadEventRecord {
  const index = store.recentEvents.findIndex((item) => item.id === id);
  const existing = index >= 0 ? store.recentEvents[index] : undefined;
  const nextRecord = updater(existing);
  if (index >= 0) {
    store.recentEvents[index] = nextRecord;
  } else {
    store.recentEvents.unshift(nextRecord);
  }
  return nextRecord;
}

function extractClientContext(req: Request): MetaClientContext {
  const forwarded = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim();
  const rawIp = forwarded || req.ip || req.socket.remoteAddress || '';
  const clientIp = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
  const userAgent =
    typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : '';
  const fbp = typeof req.body?.fbp === 'string' ? req.body.fbp.trim().slice(0, 128) : '';
  const fbc = typeof req.body?.fbc === 'string' ? req.body.fbc.trim().slice(0, 256) : '';
  const eventSourceUrl =
    typeof req.body?.eventSourceUrl === 'string'
      ? req.body.eventSourceUrl.trim().slice(0, 500)
      : '';
  return { clientIp, userAgent, fbp, fbc, eventSourceUrl };
}

async function sendMetaCapiSubscribeEvent(params: {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  appName: string;
  eventId: string;
  eventSourceUrl: string;
  context?: MetaClientContext;
}): Promise<{ ok: boolean; eventsReceived?: number; fbtraceId?: string; detail: string }> {
  const pixelId = params.pixelId.trim();
  const accessToken = params.accessToken.trim();
  if (!/^\d{8,20}$/.test(pixelId) || !accessToken) {
    return { ok: false, detail: 'Missing Pixel ID or CAPI Access Token.' };
  }

  const userData: Record<string, string> = {};
  if (params.context?.clientIp) {
    userData.client_ip_address = params.context.clientIp;
  }
  if (params.context?.userAgent) {
    userData.client_user_agent = params.context.userAgent;
  }
  if (params.context?.fbp) {
    userData.fbp = params.context.fbp;
  }
  if (params.context?.fbc) {
    userData.fbc = params.context.fbc;
  }

  const bodyPayload: Record<string, unknown> = {
    data: [
      {
        event_name: 'Subscribe',
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        action_source: 'website',
        event_source_url: params.context?.eventSourceUrl || params.eventSourceUrl,
        user_data: userData,
        custom_data: {
          content_name: params.appName || 'SHANT MATKA',
          content_category: 'Android App',
          value: 0,
          currency: 'INR',
        },
      },
    ],
  };

  const cleanTestCode = (params.testEventCode || '').trim();
  if (cleanTestCode) {
    bodyPayload.test_event_code = cleanTestCode;
  }

  try {
    const graphUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(
      pixelId
    )}/events?access_token=${encodeURIComponent(accessToken)}`;

    const res = await fetch(graphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message?: string; code?: number; error_user_msg?: string };
    };

    if (!res.ok || data.error) {
      const msg = data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`;
      return { ok: false, detail: msg };
    }

    return {
      ok: true,
      eventsReceived: data.events_received ?? 1,
      fbtraceId: data.fbtrace_id,
      detail: cleanTestCode
        ? `Test Subscribe sent (events_received: ${data.events_received ?? 1}, code: ${cleanTestCode})`
        : `Subscribe sent (events_received: ${data.events_received ?? 1})`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : 'Network error calling Meta Graph API.',
    };
  }
}

async function updateRecordCapiStatus(
  downloadId: string,
  capiStatus: 'sent' | 'error' | 'skipped',
  capiDetail: string
): Promise<void> {
  const store = await readAnalytics();
  const idx = store.recentEvents.findIndex((item) => item.id === downloadId);
  if (idx >= 0) {
    store.recentEvents[idx] = {
      ...store.recentEvents[idx],
      capiStatus,
      capiDetail,
    };
    await writeAnalytics(store);
  }
}

async function markDownloadCompleted(
  downloadId: string,
  mode: 'apk' | 'pwa',
  bytesSent: number,
  totalBytes: number,
  fallbackContext?: MetaClientContext
): Promise<boolean> {
  const store = await readAnalytics();
  const existing = store.recentEvents.find((item) => item.id === downloadId);
  if (existing && existing.status === 'completed') {
    return false;
  }

  const cfg = await readSiteConfig();
  const hasCapi = Boolean(cfg.metaPixelId && cfg.metaCapiAccessToken);
  const now = new Date().toISOString();

  upsertEventRecord(store, downloadId, (prev) => ({
    id: downloadId,
    mode,
    status: 'completed',
    clickedAt: prev?.clickedAt || now,
    completedAt: now,
    bytesSent,
    totalBytes,
    capiStatus: hasCapi ? 'pending' : 'skipped',
    capiDetail: hasCapi ? 'Sending to Meta Conversions API...' : 'No CAPI token configured',
  }));

  store.realDownloads += 1;
  if (mode === 'apk') {
    store.apkDownloads += 1;
  } else {
    store.pwaInstalls += 1;
  }
  store.lastDownloadAt = now;
  await writeAnalytics(store);

  const ctx = pendingContexts.get(downloadId) || fallbackContext;
  pendingContexts.delete(downloadId);

  if (hasCapi) {
    const eventId = `sub_${mode}_${downloadId}`;
    const result = await sendMetaCapiSubscribeEvent({
      pixelId: cfg.metaPixelId,
      accessToken: cfg.metaCapiAccessToken,
      testEventCode: cfg.metaTestEventCode,
      appName: cfg.appName,
      eventId,
      eventSourceUrl: ctx?.eventSourceUrl || cfg.websiteUrl,
      context: ctx,
    });
    await updateRecordCapiStatus(downloadId, result.ok ? 'sent' : 'error', result.detail);
  }

  return true;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function getDeterministicFallbackSecret(): string {
  const envSecret = (process.env.ADMIN_SECRET || '').trim();
  if (envSecret) return envSecret;
  const seed = `${(process.env.ADMIN_PASSWORD || '').trim() || 'admin123'}:${
    process.env.VERCEL_PROJECT_ID || 'shant-matka-local'
  }`;
  return crypto.createHmac('sha256', 'shant-matka-token-secret-v1').update(seed).digest('hex');
}

async function loadOrCreateAuth(): Promise<AdminAuthStore> {
  ensureStorageDirs();
  if (HAS_REDIS) {
    const remote = await redisGetJson<AdminAuthStore>('shant_matka:auth');
    if (remote?.salt && remote?.passwordHash && remote?.tokenSecret) {
      return remote;
    }
  }
  if (fs.existsSync(AUTH_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8')) as AdminAuthStore;
      if (parsed.salt && parsed.passwordHash && parsed.tokenSecret) {
        return parsed;
      }
    } catch {
      // Recreate below if corrupted
    }
  }
  const initialPassword = (process.env.ADMIN_PASSWORD || '').trim() || 'admin123';
  const salt = crypto
    .createHmac('sha256', 'shant-matka-salt-v1')
    .update(getDeterministicFallbackSecret())
    .digest('hex')
    .slice(0, 32);
  const tokenSecret = IS_VERCEL
    ? getDeterministicFallbackSecret()
    : (process.env.ADMIN_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
  const store: AdminAuthStore = {
    salt,
    passwordHash: hashPassword(initialPassword, salt),
    tokenSecret,
  };
  fs.writeFileSync(AUTH_PATH, JSON.stringify(store, null, 2), 'utf8');
  if (HAS_REDIS) {
    await redisSetJson('shant_matka:auth', store);
  }
  return store;
}

async function saveAuth(store: AdminAuthStore): Promise<void> {
  ensureStorageDirs();
  fs.writeFileSync(AUTH_PATH, JSON.stringify(store, null, 2), 'utf8');
  if (HAS_REDIS) {
    await redisSetJson('shant_matka:auth', store);
  }
}

function normalizeConfig(raw: Partial<SiteConfig>): SiteConfig {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    metaPixelId: typeof raw.metaPixelId === 'string' ? raw.metaPixelId : DEFAULT_CONFIG.metaPixelId,
    metaCapiAccessToken:
      typeof raw.metaCapiAccessToken === 'string'
        ? raw.metaCapiAccessToken
        : DEFAULT_CONFIG.metaCapiAccessToken,
    metaTestEventCode:
      typeof raw.metaTestEventCode === 'string'
        ? raw.metaTestEventCode
        : DEFAULT_CONFIG.metaTestEventCode,
    hasCapiConfigured: Boolean(
      typeof raw.metaCapiAccessToken === 'string' && raw.metaCapiAccessToken.trim()
    ),
    trackPageViewOnLoad: Boolean(raw.trackPageViewOnLoad),
    gameRates: Array.isArray(raw.gameRates) ? raw.gameRates : DEFAULT_CONFIG.gameRates,
    storageMode: STORAGE_MODE,
  };
}

async function readSiteConfig(): Promise<SiteConfig> {
  ensureStorageDirs();
  if (HAS_REDIS) {
    const remote = await redisGetJson<Partial<SiteConfig>>('shant_matka:config');
    if (remote) {
      return normalizeConfig(remote);
    }
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<SiteConfig>;
    return normalizeConfig(raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function toPublicConfig(cfg: SiteConfig): SiteConfig {
  return {
    ...cfg,
    metaCapiAccessToken: '',
    metaTestEventCode: '',
    hasCapiConfigured: Boolean(cfg.metaCapiAccessToken && cfg.metaCapiAccessToken.trim()),
  };
}

async function writeSiteConfig(config: SiteConfig): Promise<SiteConfig> {
  ensureStorageDirs();
  const next: SiteConfig = {
    ...config,
    hasCapiConfigured: Boolean(config.metaCapiAccessToken && config.metaCapiAccessToken.trim()),
    storageMode: STORAGE_MODE,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  if (HAS_REDIS) {
    await redisSetJson('shant_matka:config', next);
  }
  return next;
}

function signToken(secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ role: 'admin', exp: Date.now() + 24 * 60 * 60 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const auth = await loadOrCreateAuth();
  if (!token || !verifyToken(token, auth.tokenSecret)) {
    res.status(401).json({ error: 'Unauthorized. Please log in as admin.' });
    return;
  }
  next();
}

function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function sanitizeHttpUrl(value: unknown, allowEmpty = true): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return allowEmpty ? '' : null;
  if (trimmed.startsWith('/uploads/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function decodePngDataUrl(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const buf = Buffer.from(match[1], 'base64');
  if (
    buf.length < 8 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return null;
  }
  return buf;
}

function getAppSlug(appName: string): string {
  return (appName || 'SHANT-MATKA').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'app';
}

export function createApp(): Express {
  ensureStorageDirs();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  const jsonParser = express.json({ limit: '15mb' });
  const rawApkParser = express.raw({ type: '*/*', limit: '150mb' });

  // Public site configuration (never leaks private CAPI token or test code)
  app.get('/api/config', async (_req, res) => {
    const cfg = await readSiteConfig();
    res.setHeader('Cache-Control', 'no-store');
    res.json(toPublicConfig(cfg));
  });

  // Dynamic Web App Manifest matching Admin Panel settings
  app.get('/manifest.webmanifest', async (req, res) => {
    const cfg = await readSiteConfig();
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = req.get('host');
    const manifestUrl = host ? `${proto}://${host}/manifest.webmanifest` : undefined;

    const manifest = {
      id: 'shant-matka',
      name: cfg.appName || 'SHANT MATKA',
      short_name: (cfg.shortName || cfg.appName || 'SHANT MATKA').slice(0, 12),
      description: cfg.description || DEFAULT_CONFIG.description,
      start_url: '/?launch=app',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: cfg.themeColor || '#8B0000',
      background_color: cfg.backgroundColor || '#120000',
      prefer_related_applications: false,
      ...(manifestUrl
        ? {
            related_applications: [
              {
                platform: 'webapp',
                url: manifestUrl,
              },
            ],
          }
        : {}),
      icons: [
        {
          src: cfg.icon192Url || '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: cfg.icon512Url || '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: cfg.icon512MaskableUrl || '/icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(JSON.stringify(manifest));
  });

  // Tracked byte-verified APK download endpoint
  app.get('/api/download/apk', async (req, res) => {
    const cfg = await readSiteConfig();
    const rawUrl = (cfg.apkUrl || '').trim();
    if (!rawUrl) {
      res.status(404).json({ error: 'No APK file configured.' });
      return;
    }

    const didParam = typeof req.query.did === 'string' ? req.query.did.trim().slice(0, 64) : '';
    const downloadId = didParam || crypto.randomUUID();
    const slug = getAppSlug(cfg.appName);
    const reqCtx = extractClientContext(req);
    if (!pendingContexts.has(downloadId)) {
      pendingContexts.set(downloadId, reqCtx);
    }

    if (rawUrl.startsWith('/uploads/')) {
      const cleanPath = rawUrl.split('?')[0];
      const fileName = path.basename(cleanPath);
      const fullPath = path.join(UPLOADS_DIR, fileName);
      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: 'Uploaded APK file not found.' });
        return;
      }

      const stat = fs.statSync(fullPath);
      const store = await readAnalytics();
      upsertEventRecord(store, downloadId, (prev) => ({
        id: downloadId,
        mode: 'apk',
        status: 'downloading',
        clickedAt: prev?.clickedAt || new Date().toISOString(),
        completedAt: null,
        bytesSent: 0,
        totalBytes: stat.size,
        capiStatus: prev?.capiStatus,
        capiDetail: prev?.capiDetail,
      }));
      await writeAnalytics(store);

      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}.apk"`);
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('Cache-Control', 'no-store');

      let bytesSent = 0;
      let aborted = false;
      let streamEnded = false;

      const stream = fs.createReadStream(fullPath);
      req.on('close', () => {
        if (!res.writableFinished) {
          aborted = true;
          stream.destroy();
          pendingContexts.delete(downloadId);
          readAnalytics().then((s) => {
            upsertEventRecord(s, downloadId, (prev) => ({
              id: downloadId,
              mode: 'apk',
              status: prev?.status === 'completed' ? 'completed' : 'aborted',
              clickedAt: prev?.clickedAt || new Date().toISOString(),
              completedAt: prev?.completedAt || null,
              bytesSent,
              totalBytes: stat.size,
              capiStatus: prev?.capiStatus,
              capiDetail: prev?.capiDetail,
            }));
            return writeAnalytics(s);
          });
        }
      });

      stream.on('data', (chunk: Buffer | string) => {
        bytesSent += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      });

      stream.on('end', () => {
        streamEnded = true;
      });

      stream.on('error', () => {
        aborted = true;
        if (!res.headersSent) {
          res.status(500).end('Failed to read APK file.');
        } else {
          res.destroy();
        }
      });

      res.on('finish', () => {
        if (!aborted && streamEnded && bytesSent === stat.size && stat.size > 0) {
          void markDownloadCompleted(downloadId, 'apk', bytesSent, stat.size, reqCtx);
        }
      });

      stream.pipe(res);
      return;
    }

    // External direct APK URL -> attempt verified binary stream proxy
    try {
      const upstream = await fetch(rawUrl, { redirect: 'follow' });
      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!upstream.ok || !upstream.body || contentType.includes('text/html')) {
        const s = await readAnalytics();
        upsertEventRecord(s, downloadId, (prev) => ({
          id: downloadId,
          mode: 'apk',
          status: 'aborted',
          clickedAt: prev?.clickedAt || new Date().toISOString(),
          completedAt: null,
          bytesSent: 0,
          totalBytes: 0,
          capiStatus: 'skipped',
          capiDetail: 'External URL did not serve a direct APK binary',
        }));
        await writeAnalytics(s);
        res.redirect(302, rawUrl);
        return;
      }

      const contentLengthHeader = upstream.headers.get('content-length');
      const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;

      const s = await readAnalytics();
      upsertEventRecord(s, downloadId, (prev) => ({
        id: downloadId,
        mode: 'apk',
        status: 'downloading',
        clickedAt: prev?.clickedAt || new Date().toISOString(),
        completedAt: null,
        bytesSent: 0,
        totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
      }));
      await writeAnalytics(s);

      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}.apk"`);
      if (Number.isFinite(totalBytes) && totalBytes > 0) {
        res.setHeader('Content-Length', String(totalBytes));
      }
      res.setHeader('Cache-Control', 'no-store');

      let bytesSent = 0;
      let aborted = false;
      let streamEnded = false;

      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as import('node:stream/web').ReadableStream
      );

      req.on('close', () => {
        if (!res.writableFinished) {
          aborted = true;
          nodeStream.destroy();
          pendingContexts.delete(downloadId);
          readAnalytics().then((st) => {
            upsertEventRecord(st, downloadId, (prev) => ({
              id: downloadId,
              mode: 'apk',
              status: prev?.status === 'completed' ? 'completed' : 'aborted',
              clickedAt: prev?.clickedAt || new Date().toISOString(),
              completedAt: prev?.completedAt || null,
              bytesSent,
              totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
            }));
            return writeAnalytics(st);
          });
        }
      });

      nodeStream.on('data', (chunk: Buffer) => {
        bytesSent += chunk.length;
      });

      nodeStream.on('end', () => {
        streamEnded = true;
      });

      nodeStream.on('error', () => {
        aborted = true;
        if (!res.headersSent) {
          res.redirect(302, rawUrl);
        } else {
          res.destroy();
        }
      });

      res.on('finish', () => {
        const expectedOk = !totalBytes || bytesSent >= totalBytes;
        if (!aborted && streamEnded && bytesSent > 0 && expectedOk) {
          void markDownloadCompleted(downloadId, 'apk', bytesSent, totalBytes || bytesSent, reqCtx);
        }
      });

      nodeStream.pipe(res);
    } catch {
      res.redirect(302, rawUrl);
    }
  });

  // Serve uploaded logos and APK files safely (supports Redis-backed PNGs on Vercel too)
  app.get('/uploads/:filename', async (req, res) => {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      if (HAS_REDIS && safeName.endsWith('.png')) {
        const b64 = await redisGetJson<string>(`shant_matka:icon:${safeName}`);
        if (b64) {
          const buf = Buffer.from(b64, 'base64');
          fs.writeFileSync(fullPath, buf);
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.send(buf);
          return;
        }
      }
      res.status(404).json({ error: 'File not found' });
      return;
    }
    if (safeName.endsWith('.apk')) {
      const cfg = await readSiteConfig();
      const slug = getAppSlug(cfg.appName);
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}.apk"`);
    } else if (safeName.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
    res.sendFile(fullPath);
  });

  // Raw binary APK upload route (handles both Express stream and pre-buffered serverless req.body)
  app.post(
    '/api/admin/upload-apk',
    requireAdmin,
    (req, res, next) => {
      if (Buffer.isBuffer(req.body)) {
        next();
        return;
      }
      rawApkParser(req, res, next);
    },
    async (req, res) => {
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length < 4) {
        res.status(400).json({ error: 'Empty or invalid APK upload.' });
        return;
      }
      if (body[0] !== 0x50 || body[1] !== 0x4b || body[2] !== 0x03 || body[3] !== 0x04) {
        res.status(400).json({ error: 'Invalid file format. Please upload a valid .apk file.' });
        return;
      }
      const apkPath = path.join(UPLOADS_DIR, 'shant-matka.apk');
      fs.writeFileSync(apkPath, body);

      const current = await readSiteConfig();
      const updated = await writeSiteConfig({
        ...current,
        apkUrl: `/uploads/shant-matka.apk?v=${Date.now()}`,
      });
      res.json({ config: updated, sizeBytes: body.length });
    }
  );

  // JSON middleware for Tracking & Admin APIs (skips if serverless runtime already parsed req.body)
  app.use('/api', (req, res, next) => {
    if (req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

  // Record button click + Meta browser context
  app.post('/api/track/click', async (req, res) => {
    const mode = req.body?.mode === 'apk' ? 'apk' : 'pwa';
    const downloadId = crypto.randomUUID();
    const now = new Date().toISOString();
    pendingContexts.set(downloadId, extractClientContext(req));

    const store = await readAnalytics();
    store.buttonClicks += 1;
    store.lastClickAt = now;
    upsertEventRecord(store, downloadId, () => ({
      id: downloadId,
      mode,
      status: 'clicked',
      clickedAt: now,
      completedAt: null,
      bytesSent: 0,
      totalBytes: 0,
    }));
    await writeAnalytics(store);
    res.json({ downloadId });
  });

  // Poll verified download status
  app.get('/api/track/download-status', async (req, res) => {
    const did = typeof req.query.did === 'string' ? req.query.did.trim() : '';
    if (!did) {
      res.status(400).json({ error: 'Missing did' });
      return;
    }
    const store = await readAnalytics();
    const record = store.recentEvents.find((item) => item.id === did);
    res.setHeader('Cache-Control', 'no-store');
    if (!record) {
      res.json({ status: 'unknown', completed: false, bytesSent: 0, totalBytes: 0 });
      return;
    }
    res.json({
      status: record.status,
      completed: record.status === 'completed',
      bytesSent: record.bytesSent,
      totalBytes: record.totalBytes,
      mode: record.mode,
    });
  });

  // Record real PWA installation ONLY when browser fires appinstalled event
  app.post('/api/track/install-complete', async (req, res) => {
    const rawId = typeof req.body?.downloadId === 'string' ? req.body.downloadId.trim() : '';
    const downloadId = rawId || crypto.randomUUID();
    const ctx = extractClientContext(req);
    const recorded = await markDownloadCompleted(downloadId, 'pwa', 1, 1, ctx);
    res.json({ completed: true, recorded, downloadId });
  });

  app.post('/api/admin/login', async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const auth = await loadOrCreateAuth();
    const candidateHash = hashPassword(password, auth.salt);
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(auth.passwordHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'Incorrect admin password.' });
      return;
    }
    res.json({ token: signToken(auth.tokenSecret) });
  });

  app.get('/api/admin/verify', requireAdmin, (_req, res) => {
    res.json({ authenticated: true });
  });

  app.get('/api/admin/config', requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await readSiteConfig());
  });

  app.get('/api/admin/analytics', requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await readAnalytics());
  });

  app.post('/api/admin/analytics/reset', requireAdmin, async (_req, res) => {
    const reset = await writeAnalytics({ ...EMPTY_ANALYTICS, recentEvents: [] });
    res.json(reset);
  });

  app.post('/api/admin/meta/test', requireAdmin, async (req, res) => {
    const cfg = await readSiteConfig();
    const pixelId =
      typeof req.body?.metaPixelId === 'string' && req.body.metaPixelId.trim()
        ? req.body.metaPixelId.trim()
        : cfg.metaPixelId;
    const accessToken =
      typeof req.body?.metaCapiAccessToken === 'string' && req.body.metaCapiAccessToken.trim()
        ? req.body.metaCapiAccessToken.trim()
        : cfg.metaCapiAccessToken;
    const testEventCode =
      typeof req.body?.metaTestEventCode === 'string'
        ? req.body.metaTestEventCode.trim()
        : cfg.metaTestEventCode;

    if (!/^\d{8,20}$/.test(pixelId)) {
      res.status(400).json({ error: 'Valid numeric Meta Pixel ID is required.' });
      return;
    }
    if (!accessToken) {
      res.status(400).json({ error: 'Conversions API Access Token is required to send test event.' });
      return;
    }

    const ctx = extractClientContext(req);
    const result = await sendMetaCapiSubscribeEvent({
      pixelId,
      accessToken,
      testEventCode,
      appName: cfg.appName,
      eventId: `test_sub_${Date.now()}`,
      eventSourceUrl: ctx.eventSourceUrl || cfg.websiteUrl,
      context: ctx,
    });

    if (!result.ok) {
      res.status(400).json({ error: result.detail });
      return;
    }

    res.json(result);
  });

  app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';

    if (newPassword.length < 4) {
      res.status(400).json({ error: 'New password must be at least 4 characters.' });
      return;
    }

    const auth = await loadOrCreateAuth();
    const currentHash = hashPassword(currentPassword, auth.salt);
    const a = Buffer.from(currentHash, 'hex');
    const b = Buffer.from(auth.passwordHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    const nextAuth: AdminAuthStore = {
      salt: newSalt,
      passwordHash: hashPassword(newPassword, newSalt),
      tokenSecret: auth.tokenSecret,
    };
    await saveAuth(nextAuth);
    res.json({ updated: true, token: signToken(nextAuth.tokenSecret) });
  });

  app.put('/api/admin/config', requireAdmin, async (req, res) => {
    const body = req.body as Partial<SiteConfig>;
    const current = await readSiteConfig();

    const websiteUrl = sanitizeHttpUrl(body.websiteUrl ?? current.websiteUrl, false);
    if (!websiteUrl) {
      res.status(400).json({ error: 'Target Website URL must be a valid http(s) URL.' });
      return;
    }

    const apkUrl = sanitizeHttpUrl(body.apkUrl ?? current.apkUrl, true);
    if (apkUrl === null) {
      res.status(400).json({ error: 'APK URL must be empty, /uploads/..., or a valid http(s) URL.' });
      return;
    }

    let metaPixelId = current.metaPixelId;
    if (typeof body.metaPixelId === 'string') {
      const cleanedPixel = body.metaPixelId.trim();
      if (cleanedPixel && !/^\d{8,20}$/.test(cleanedPixel)) {
        res.status(400).json({ error: 'Meta Pixel ID must be an 8-20 digit numeric ID (or empty).' });
        return;
      }
      metaPixelId = cleanedPixel;
    }

    const metaCapiAccessToken =
      typeof body.metaCapiAccessToken === 'string'
        ? body.metaCapiAccessToken.trim().slice(0, 512)
        : current.metaCapiAccessToken;

    const metaTestEventCode =
      typeof body.metaTestEventCode === 'string'
        ? body.metaTestEventCode.trim().slice(0, 64)
        : current.metaTestEventCode;

    const trackPageViewOnLoad =
      typeof body.trackPageViewOnLoad === 'boolean'
        ? body.trackPageViewOnLoad
        : current.trackPageViewOnLoad;

    const appName =
      typeof body.appName === 'string' && body.appName.trim()
        ? body.appName.trim().slice(0, 60)
        : current.appName;

    const shortName =
      typeof body.shortName === 'string' && body.shortName.trim()
        ? body.shortName.trim().slice(0, 20)
        : appName.slice(0, 12);

    const tagline =
      typeof body.tagline === 'string' ? body.tagline.trim().slice(0, 80) : current.tagline;

    const description =
      typeof body.description === 'string'
        ? body.description.trim().slice(0, 260)
        : current.description;

    const rating =
      typeof body.rating === 'string' && body.rating.trim()
        ? body.rating.trim().slice(0, 8)
        : current.rating;

    const apkButtonLabel =
      typeof body.apkButtonLabel === 'string' && body.apkButtonLabel.trim()
        ? body.apkButtonLabel.trim().slice(0, 40)
        : current.apkButtonLabel;

    const whatsappNumber =
      typeof body.whatsappNumber === 'string'
        ? body.whatsappNumber.replace(/[^\d]/g, '').slice(0, 16)
        : current.whatsappNumber;

    const whatsappMessage =
      typeof body.whatsappMessage === 'string'
        ? body.whatsappMessage.trim().slice(0, 160)
        : current.whatsappMessage;

    const themeColor = isValidHexColor(body.themeColor) ? body.themeColor : current.themeColor;
    const backgroundColor = isValidHexColor(body.backgroundColor)
      ? body.backgroundColor
      : current.backgroundColor;

    let gameRates = current.gameRates;
    if (Array.isArray(body.gameRates)) {
      gameRates = body.gameRates
        .filter(
          (item): item is GameRateItem =>
            Boolean(item) &&
            typeof item.game === 'string' &&
            item.game.trim().length > 0 &&
            typeof item.rate === 'string' &&
            item.rate.trim().length > 0
        )
        .map((item, idx) => ({
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `rate-${idx}`,
          game: item.game.trim().slice(0, 48),
          rate: item.rate.trim().slice(0, 32),
        }));
    }

    const updated = await writeSiteConfig({
      ...current,
      appName,
      shortName,
      tagline,
      description,
      rating,
      websiteUrl,
      apkUrl,
      apkButtonLabel,
      whatsappNumber,
      whatsappMessage,
      metaPixelId,
      metaCapiAccessToken,
      metaTestEventCode,
      trackPageViewOnLoad,
      themeColor,
      backgroundColor,
      gameRates,
    });

    res.json(updated);
  });

  app.post('/api/admin/upload-icons', requireAdmin, async (req, res) => {
    const buf192 = decodePngDataUrl(req.body?.icon192);
    const buf512 = decodePngDataUrl(req.body?.icon512);
    const bufMaskable = decodePngDataUrl(req.body?.icon512Maskable);
    const bufApple = decodePngDataUrl(req.body?.appleTouch);

    if (!buf192 || !buf512 || !bufMaskable || !bufApple) {
      res.status(400).json({ error: 'Invalid PNG icon payload.' });
      return;
    }

    fs.writeFileSync(path.join(UPLOADS_DIR, 'icon-192.png'), buf192);
    fs.writeFileSync(path.join(UPLOADS_DIR, 'icon-512.png'), buf512);
    fs.writeFileSync(path.join(UPLOADS_DIR, 'icon-512-maskable.png'), bufMaskable);
    fs.writeFileSync(path.join(UPLOADS_DIR, 'apple-touch-icon.png'), bufApple);

    if (HAS_REDIS) {
      await Promise.all([
        redisSetJson('shant_matka:icon:icon-192.png', buf192.toString('base64')),
        redisSetJson('shant_matka:icon:icon-512.png', buf512.toString('base64')),
        redisSetJson('shant_matka:icon:icon-512-maskable.png', bufMaskable.toString('base64')),
        redisSetJson('shant_matka:icon:apple-touch-icon.png', bufApple.toString('base64')),
      ]);
    }

    const v = Date.now();
    const current = await readSiteConfig();
    const updated = await writeSiteConfig({
      ...current,
      logoUrl: `/uploads/icon-192.png?v=${v}`,
      icon192Url: `/uploads/icon-192.png?v=${v}`,
      icon512Url: `/uploads/icon-512.png?v=${v}`,
      icon512MaskableUrl: `/uploads/icon-512-maskable.png?v=${v}`,
    });

    res.json(updated);
  });

  app.post('/api/admin/reset-logo', requireAdmin, async (_req, res) => {
    const current = await readSiteConfig();
    const updated = await writeSiteConfig({
      ...current,
      logoUrl: '/icons/icon-192.png',
      icon192Url: '/icons/icon-192.png',
      icon512Url: '/icons/icon-512.png',
      icon512MaskableUrl: '/icons/icon-512-maskable.png',
    });
    res.json(updated);
  });

  return app;
}
