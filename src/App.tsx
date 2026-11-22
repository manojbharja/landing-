import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  MoreVertical,
  Share,
  Smartphone,
  Star,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  fireMetaPixelSubscribe,
  getMetaBrowserContext,
  initMetaPixel,
} from './lib/metaPixel';
import { DEFAULT_SITE_CONFIG, type SiteConfig } from './types/siteConfig';

function isAdminPath(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname === '/admin' ||
    window.location.search.includes('admin=1')
  );
}

export default function App() {
  const {
    isInstalled,
    isAlreadyInstalledOnDevice,
    isInstallable,
    isIOS,
    isSamsungInternet,
    isInAppBrowser,
    installOutcome,
    appInstalledSeq,
    install,
  } = usePWAInstall();

  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [showAdmin, setShowAdmin] = useState<boolean>(() => isAdminPath());
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloadingApk, setIsDownloadingApk] = useState<boolean>(false);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);

  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<number | null>(null);
  const pendingDownloadIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const lastHandledInstallSeqRef = useRef<number>(0);

  useEffect(() => {
    fetch('/api/config', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SiteConfig | null) => {
        if (data && data.appName) {
          setConfig(data);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setShowAdmin(isAdminPath());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (config.appName) {
      document.title = `${config.appName} — Official VIP Android App`;
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta && config.themeColor) {
      themeMeta.setAttribute('content', config.themeColor);
    }
    if (config.logoUrl) {
      const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (iconLink) {
        iconLink.href = config.logoUrl;
      }
      const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
      if (appleLink) {
        appleLink.href = config.logoUrl;
      }
    }
  }, [config.appName, config.themeColor, config.logoUrl]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  let targetHost = 'new.rajagamevip.site';
  try {
    targetHost = new URL(config.websiteUrl || 'https://new.rajagamevip.site/').hostname;
  } catch {
    targetHost = 'new.rajagamevip.site';
  }

  const isAppLaunch =
    typeof window !== 'undefined' &&
    !showAdmin &&
    (window.location.search.includes('launch=app') || isInstalled) &&
    window.location.hostname !== targetHost;

  // Connect Meta Pixel on public download page (never fires Subscribe prematurely)
  useEffect(() => {
    if (!showAdmin && !isAppLaunch && config.metaPixelId) {
      initMetaPixel(config.metaPixelId, Boolean(config.trackPageViewOnLoad));
    }
  }, [showAdmin, isAppLaunch, config.metaPixelId, config.trackPageViewOnLoad]);

  // Record PWA install completion & fire Meta Subscribe ONLY when Chrome confirms appinstalled
  useEffect(() => {
    if (appInstalledSeq === 0 || appInstalledSeq === lastHandledInstallSeqRef.current) {
      return;
    }
    lastHandledInstallSeqRef.current = appInstalledSeq;

    const did = pendingDownloadIdRef.current || '';
    const metaCtx = getMetaBrowserContext();
    fetch('/api/track/install-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        downloadId: did,
        fbp: metaCtx.fbp,
        fbc: metaCtx.fbc,
        eventSourceUrl: metaCtx.eventSourceUrl,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { downloadId?: string } | null) => {
        const finalId = data?.downloadId || did || String(Date.now());
        if (config.metaPixelId) {
          fireMetaPixelSubscribe(config.metaPixelId, config.appName, `sub_pwa_${finalId}`);
        }
        setDownloadError(null);
        setDownloadStatus(`${config.appName} installed successfully on your phone.`);
      })
      .catch(() => {
        if (config.metaPixelId) {
          fireMetaPixelSubscribe(config.metaPixelId, config.appName, `sub_pwa_${did || Date.now()}`);
        }
      });
  }, [appInstalledSeq, config.metaPixelId, config.appName]);

  const openAdminPanel = () => {
    window.history.pushState({}, '', '/admin');
    setShowAdmin(true);
  };

  const closeAdminPanel = () => {
    window.history.pushState({}, '', '/');
    setShowAdmin(false);
  };

  const handleBrandTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);
    }
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      openAdminPanel();
      return;
    }
    tapTimerRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
    }, 650);
  };

  const startStatusPolling = (downloadId: string) => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    const startedAt = Date.now();
    const maxWaitMs = 3 * 60 * 1000;

    pollIntervalRef.current = window.setInterval(async () => {
      if (Date.now() - startedAt > maxWaitMs) {
        if (pollIntervalRef.current !== null) {
          window.clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsDownloadingApk(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/track/download-status?did=${encodeURIComponent(downloadId)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: string;
          completed: boolean;
        };

        if (data.completed) {
          if (pollIntervalRef.current !== null) {
            window.clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsDownloadingApk(false);
          setDownloadError(null);
          setDownloadStatus(
            `${config.appName} APK downloaded on your phone! Tap the downloaded file to install.`
          );
          if (config.metaPixelId) {
            fireMetaPixelSubscribe(config.metaPixelId, config.appName, `sub_apk_${downloadId}`);
          }
        } else if (data.status === 'aborted') {
          if (pollIntervalRef.current !== null) {
            window.clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setIsDownloadingApk(false);
          setDownloadStatus(null);
          setDownloadError('APK download was cancelled or did not finish.');
        }
      } catch {
        // Ignore transient network poll glitch
      }
    }, 1000);
  };

  const handlePrimaryAction = async () => {
    setDownloadStatus(null);
    setDownloadError(null);

    const directApk = (config.apkUrl || '').trim();
    const mode = directApk ? 'apk' : 'pwa';

    let downloadId = `local_${Date.now()}`;
    const metaCtx = getMetaBrowserContext();
    try {
      const res = await fetch('/api/track/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          fbp: metaCtx.fbp,
          fbc: metaCtx.fbc,
          eventSourceUrl: metaCtx.eventSourceUrl,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { downloadId?: string };
        if (data.downloadId) {
          downloadId = data.downloadId;
        }
      }
    } catch {
      // Proceed smoothly even if tracking request fails
    }

    pendingDownloadIdRef.current = downloadId;

    if (directApk) {
      setIsDownloadingApk(true);
      setDownloadStatus('Downloading APK to your phone...');
      const a = document.createElement('a');
      a.href = `/api/download/apk?did=${encodeURIComponent(downloadId)}`;
      a.download = `${config.appName.replace(/\s+/g, '-')}.apk`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      startStatusPolling(downloadId);
      return;
    }

    const outcome = await install();
    if (outcome === 'accepted') {
      setDownloadStatus(`Installing ${config.appName}...`);
    } else if (outcome === 'dismissed') {
      setDownloadError('Installation was cancelled.');
    } else {
      setShowInstallGuide(true);
    }
  };

  if (showAdmin) {
    return (
      <AdminPanel
        config={config}
        onConfigUpdated={(next) => setConfig(next)}
        onBackToSite={closeAdminPanel}
      />
    );
  }

  if (isAppLaunch) {
    return (
      <main className="fixed inset-0 h-dvh w-screen overflow-hidden bg-white">
        <iframe
          src={config.websiteUrl}
          title={config.appName}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write; payment"
        />
      </main>
    );
  }

  const waDigits = (config.whatsappNumber || '').replace(/[^\d]/g, '');
  const waMsg = encodeURIComponent(config.whatsappMessage || `Hello ${config.appName} Support`);
  const whatsappHref = waDigits
    ? `https://wa.me/${waDigits}?text=${waMsg}`
    : `https://wa.me/?text=${waMsg}`;

  const chromeIntentHref =
    typeof window !== 'undefined'
      ? `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=${window.location.protocol.replace(':', '')};package=com.android.chrome;end`
      : '#';

  const hasApkFile = Boolean((config.apkUrl || '').trim());

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{ backgroundColor: config.backgroundColor || '#120000' }}
    >
      {/* Luxury VIP Radial Crimson Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse at 50% 0%, ${config.themeColor || '#8B0000'}7A 0%, transparent 65%)`,
        }}
      />

      {/* Top Bar Contract: 3 zones, gap-8, single-line controls */}
      <header className="relative z-20 border-b border-[#D4AF37]/20 bg-[#140000]/90 backdrop-blur-xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-8 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={handleBrandTap}
            className="font-display text-lg font-extrabold tracking-wider text-[#F7D774] whitespace-nowrap shrink-0 cursor-pointer bg-transparent border-0 p-0 text-left"
          >
            {config.appName}
          </button>

          <nav
            aria-label="Primary navigation"
            className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-300"
          >
            <a
              href="#download"
              className="hover:text-[#F7D774] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Download
            </a>
            <a
              href="#game-rates"
              className="hover:text-[#F7D774] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Game Rates
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <a
              href={config.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-3.5 py-2 text-xs font-semibold text-[#F7D774] transition-colors hover:bg-[#D4AF37]/20 whitespace-nowrap shrink-0"
            >
              <span>Open Website</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        {/* Centered VIP Download Hero */}
        <section
          id="download"
          className="scroll-mt-20 flex flex-col items-center justify-center py-12 text-center sm:py-16"
        >
          <div className="mx-auto flex max-w-2xl flex-col items-center">
            <div className="relative rounded-3xl border border-[#D4AF37]/45 bg-[#160000] p-1.5 shadow-[0_20px_60px_rgba(139,0,0,0.55)]">
              <img
                src={config.logoUrl || '/icons/icon-192.png'}
                alt={`${config.appName} App Icon`}
                className="h-24 w-24 rounded-2xl object-cover sm:h-28 sm:w-28"
              />
            </div>

            <h1 className="mt-6 font-display text-4xl font-black tracking-wide text-white sm:text-5xl">
              {config.appName}
            </h1>

            {/* Clean 5-Star Rating */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5 text-sm">
              <div className="flex items-center gap-1" aria-label="5 out of 5 stars">
                {[0, 1, 2, 3, 4].map((index) => (
                  <Star
                    key={index}
                    className="h-4 w-4 fill-[#F7D774] text-[#F7D774]"
                    aria-hidden="true"
                  />
                ))}
              </div>
              <span className="font-mono font-bold text-[#F7D774] tabular-nums">
                {config.rating || '5.0'}
              </span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-slate-300">{config.tagline}</span>
            </div>

            <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-200">
              {config.description}
            </p>

            {/* Larger Centered Animated VIP Download / Install Button */}
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={handlePrimaryAction}
                disabled={isDownloadingApk}
                style={
                  config.themeColor && config.themeColor !== '#8B0000'
                    ? { backgroundColor: config.themeColor }
                    : undefined
                }
                className="vip-cta-btn relative inline-flex min-h-[64px] items-center justify-center gap-3.5 overflow-hidden rounded-2xl border border-[#F7D774]/60 bg-gradient-to-b from-[#B20B0B] via-[#8B0000] to-[#560000] px-10 py-4 text-lg font-extrabold tracking-wide text-white shadow-[0_16px_44px_rgba(139,0,0,0.72)] transition-colors hover:from-[#c70e0e] hover:to-[#6b0000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7D774] disabled:opacity-75 sm:px-12 sm:text-xl whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span
                  aria-hidden="true"
                  className="vip-cta-sheen pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                />
                <Download className="relative z-10 h-6 w-6 shrink-0 text-[#F7D774]" aria-hidden="true" />
                <span className="relative z-10">
                  {isDownloadingApk
                    ? 'Downloading APK...'
                    : installOutcome === 'prompting'
                    ? 'Confirming...'
                    : config.apkButtonLabel || `Install ${config.appName} App`}
                </span>
              </button>
            </div>

            {downloadStatus && (
              <div
                role="status"
                className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-emerald-300"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{downloadStatus}</span>
              </div>
            )}

            {downloadError && (
              <p role="alert" className="mt-4 text-sm font-medium text-amber-300">
                {downloadError}
              </p>
            )}

            {(isInstalled || isAlreadyInstalledOnDevice) && !hasApkFile && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-xs font-medium text-emerald-300">
                  {config.appName} is already installed on this device.
                </p>
                <a
                  href="/?launch=app"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/15 px-4 py-2 text-xs font-bold text-[#F7D774] hover:bg-[#D4AF37]/25"
                >
                  <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open {config.appName} App</span>
                </a>
              </div>
            )}
          </div>
        </section>

        {/* VIP Game Rates Section */}
        {config.gameRates.length > 0 && (
          <section
            id="game-rates"
            className="scroll-mt-20 border-t border-[#D4AF37]/20 pt-10"
          >
            <div className="mx-auto max-w-2xl">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold tracking-wide text-[#F7D774] sm:text-3xl">
                  Game Rates
                </h2>
                <p className="mt-1.5 text-sm text-slate-300">
                  Official {config.appName} payout rates
                </p>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-[#1B0303]/90">
                <div className="divide-y divide-[#D4AF37]/15">
                  {config.gameRates.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="text-base font-semibold text-white">
                        {item.game}
                      </span>
                      <span className="font-mono text-base font-bold text-[#F7D774] tabular-nums sm:text-lg">
                        {item.rate}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Compact Side WhatsApp Support Button */}
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp Support"
        className="fixed bottom-5 right-5 z-40 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/20 bg-[#189C4E] px-4 py-2.5 text-xs font-bold text-white shadow-lg transition-transform duration-150 hover:scale-105 hover:bg-[#168743] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7D774] whitespace-nowrap"
      >
        <svg
          className="h-4 w-4 shrink-0 fill-current"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.47 0 .1 5.37.1 11.96c0 2.11.55 4.17 1.6 5.98L0 24l6.23-1.63a11.93 11.93 0 0 0 5.83 1.49h.01c6.59 0 11.96-5.37 11.96-11.96 0-3.19-1.24-6.19-3.51-8.42zm-8.46 18.36h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.22-3.7.97.99-3.6-.23-.37a9.92 9.92 0 0 1-1.52-5.28c0-5.48 4.46-9.94 9.94-9.94 2.65 0 5.15 1.03 7.03 2.91a9.87 9.87 0 0 1 2.91 7.03c0 5.48-4.46 9.94-9.94 9.94zm5.45-7.44c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.47-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.11 3.22 5.11 4.52.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z" />
        </svg>
        <span>Support</span>
      </a>

      {showInstallGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-[#D4AF37]/30 bg-[#1B0303] p-6 text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="install-guide-modal-title" className="font-display text-lg font-bold text-white">
                  {isAlreadyInstalledOnDevice
                    ? `${config.appName} Already Installed`
                    : `Install ${config.appName} App`}
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  {isAlreadyInstalledOnDevice
                    ? 'This app is already installed on your phone.'
                    : isInAppBrowser
                    ? 'Open in Google Chrome for 1-tap installation.'
                    : isIOS
                    ? 'Follow these steps in Safari on iPhone or iPad.'
                    : isSamsungInternet
                    ? 'Install using the Samsung Internet menu.'
                    : isInstallable
                    ? 'Tap Install Now below to launch Chrome setup.'
                    : 'Use the Google Chrome menu to install (or upload an .apk in Admin for direct file download).'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                aria-label="Close install instructions"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              {isAlreadyInstalledOnDevice ? (
                <p>
                  Tap <strong>Open App</strong> below to launch {config.appName} in full screen.
                </p>
              ) : isInAppBrowser ? (
                <>
                  <p>1. You are viewing this inside an in-app browser.</p>
                  <p>
                    2. Tap <strong>Open in Google Chrome</strong> below, then tap install.
                  </p>
                </>
              ) : isIOS ? (
                <>
                  <p>
                    1. Tap the <Share className="inline h-4 w-4 mx-0.5 text-[#F7D774]" aria-hidden="true" />{' '}
                    <strong>Share</strong> button in Safari.
                  </p>
                  <p>2. Tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p>
                </>
              ) : isSamsungInternet ? (
                <>
                  <p>1. Tap the <strong>Menu</strong> icon in Samsung Internet.</p>
                  <p>2. Select <strong>Add page to</strong> &gt; <strong>Home screen</strong>.</p>
                </>
              ) : (
                <>
                  <p>
                    1. Tap the <MoreVertical className="inline h-4 w-4 text-[#F7D774]" aria-hidden="true" />{' '}
                    <strong>Chrome menu</strong> at the top-right.
                  </p>
                  <p>2. Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>) and confirm.</p>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5">
              {isAlreadyInstalledOnDevice && (
                <a
                  href="/?launch=app"
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                >
                  Open App
                </a>
              )}
              {isInAppBrowser && (
                <a
                  href={chromeIntentHref}
                  className="rounded-lg bg-[#8B0000] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a80a0a]"
                >
                  Open in Google Chrome
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
