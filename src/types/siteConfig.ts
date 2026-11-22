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

export interface DownloadEventRecord {
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

export interface AnalyticsStats {
  buttonClicks: number;
  realDownloads: number;
  apkDownloads: number;
  pwaInstalls: number;
  lastClickAt: string | null;
  lastDownloadAt: string | null;
  recentEvents: DownloadEventRecord[];
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  appName: 'SHANT MATKA',
  shortName: 'SHANT MATKA',
  tagline: 'Official VIP Android App',
  description:
    'Fast, full-screen access to new.rajagamevip.site directly from your Android home screen.',
  rating: '5.0',
  websiteUrl: 'https://new.rajagamevip.site/',
  apkUrl: '',
  apkButtonLabel: 'Install SHANT MATKA App',
  logoUrl: '/icons/icon-192.png',
  icon192Url: '/icons/icon-192.png',
  icon512Url: '/icons/icon-512.png',
  icon512MaskableUrl: '/icons/icon-512-maskable.png',
  whatsappNumber: '',
  whatsappMessage: 'Hello SHANT MATKA Support',
  metaPixelId: '',
  metaCapiAccessToken: '',
  metaTestEventCode: '',
  hasCapiConfigured: false,
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
  updatedAt: new Date(0).toISOString(),
};
