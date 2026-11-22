import type { SiteConfig } from '../types/siteConfig';
import { DEFAULT_SITE_CONFIG } from '../types/siteConfig';

export interface PWAConfig {
  appName: string;
  shortName: string;
  appId: string;
  websiteUrl: string;
  themeColor: string;
  backgroundColor: string;
}

export const SHANT_MATKA_CONFIG: PWAConfig = {
  appName: 'SHANT MATKA',
  shortName: 'SHANT MATKA',
  appId: 'shant-matka',
  websiteUrl: 'https://new.rajagamevip.site/',
  themeColor: '#8B0000',
  backgroundColor: '#120000',
};

export function generateManifestWebmanifest(config: SiteConfig = DEFAULT_SITE_CONFIG): string {
  const manifest = {
    id: SHANT_MATKA_CONFIG.appId,
    name: config.appName || SHANT_MATKA_CONFIG.appName,
    short_name: (config.shortName || config.appName || SHANT_MATKA_CONFIG.shortName).slice(0, 12),
    description: config.description || DEFAULT_SITE_CONFIG.description,
    start_url: '/?launch=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: config.themeColor || SHANT_MATKA_CONFIG.themeColor,
    background_color: config.backgroundColor || SHANT_MATKA_CONFIG.backgroundColor,
    prefer_related_applications: false,
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return JSON.stringify(manifest, null, 2);
}

export function generateServiceWorkerJs(): string {
  return `/* SHANT MATKA Service Worker — Safe Static Caching Only */
'use strict';

const CACHE_VERSION = 'shant-matka-static-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png'
];

/* Allowed static asset extensions ONLY */
const STATIC_ASSET_RE = /\\.(?:css|js|mjs|png|jpe?g|webp|svg|ico|woff2?|ttf)$/i;

/* Strictly excluded dynamic, auth, financial, and API routes */
const EXCLUDED_ROUTES_RE =
  /\\/(api|auth|login|logout|register|signup|account|profile|wallet|deposit|withdraw|payment|upi|transaction|bet|bid|game|history|dashboard|admin|otp|session|user|callback)\\b|\\.php$/i;

function isSafeStaticRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (request.headers.has('Authorization')) return false;
  if (EXCLUDED_ROUTES_RE.test(url.pathname)) return false;

  if (url.pathname === OFFLINE_URL || url.pathname === '/manifest.webmanifest') {
    return true;
  }

  return STATIC_ASSET_RE.test(url.pathname);
}

function isSafeToCacheResponse(response) {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return false;
  }
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
    return false;
  }
  if (response.headers.has('Set-Cookie')) {
    return false;
  }
  return true;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(function (asset) {
          return cache.add(new Request(asset, { cache: 'reload' })).catch(function () {
            return null;
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_VERSION) {
            return caches.delete(key);
          }
          return Promise.resolve(true);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Network-First for all HTML page navigations — NEVER cache user/account pages */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.open(CACHE_VERSION).then(function (cache) {
          return cache.match(OFFLINE_URL);
        }).then(function (offlineResponse) {
          return offlineResponse || new Response('Offline — Please check your connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
    );
    return;
  }

  /* Skip everything except verified same-origin static assets */
  if (!isSafeStaticRequest(request, url)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(request).then(function (cached) {
        const networkFetch = fetch(request).then(function (networkResponse) {
          if (isSafeToCacheResponse(networkResponse)) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(function () {
          return cached;
        });

        return cached || networkFetch;
      });
    })
  );
});
`;
}

export function generateOfflineHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#8B0000" />
    <title>Offline — SHANT MATKA</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        min-height: 100dvh;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #160000;
        background-image: radial-gradient(circle at 50% 25%, rgba(139, 0, 0, 0.36) 0%, #160000 70%);
        color: #f9fafb;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 400px;
        background: rgba(28, 6, 6, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        padding: 32px 24px;
        text-align: center;
      }
      .icon-wrap {
        width: 64px;
        height: 64px;
        margin: 0 auto 20px;
        border-radius: 14px;
        background: #2b0404;
        border: 1px solid rgba(230, 184, 77, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 10px; }
      p { font-size: 14px; line-height: 1.6; color: #d1d5db; margin-bottom: 24px; }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 46px;
        padding: 12px 20px;
        border: 0;
        border-radius: 10px;
        background: #8b0000;
        color: #ffffff;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
      .btn:hover, .btn:focus-visible {
        background: #a50a0a;
        outline: 2px solid #f7d774;
        outline-offset: 2px;
      }
      .hint { margin-top: 16px; font-size: 12px; color: #9ca3af; }
    </style>
  </head>
  <body>
    <main class="card" role="main">
      <div class="icon-wrap" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#F7D774" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0" />
          <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
          <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
          <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
          <path d="M5 12.86a10 10 0 0 1 5.17-2.8" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <h1>You are offline</h1>
      <p>SHANT MATKA requires an active internet connection to load live markets, account sessions, and results.</p>
      <button type="button" class="btn" id="retryBtn">Try Again</button>
      <p class="hint" id="statusText">Check mobile data or Wi-Fi and tap Try Again.</p>
    </main>
    <script>
      document.getElementById('retryBtn').addEventListener('click', function () {
        window.location.reload();
      });
      window.addEventListener('online', function () {
        document.getElementById('statusText').textContent = 'Connection restored. Reloading...';
        window.location.reload();
      });
    </script>
  </body>
</html>
`;
}

export function generateInstallScriptJs(): string {
  return `/* SHANT MATKA — Non-intrusive PWA Registration & Install Controller */
(function () {
  'use strict';

  var deferredPrompt = null;
  var installButton = null;
  var modalEl = null;

  function isStandaloneMode() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIOSDevice() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function isSamsungBrowser() {
    return /samsungbrowser/i.test(window.navigator.userAgent);
  }

  function hideInstallButton() {
    if (installButton) {
      installButton.style.display = 'none';
      installButton.setAttribute('aria-hidden', 'true');
    }
  }

  function showInstallButton() {
    if (installButton && !isStandaloneMode()) {
      installButton.style.display = 'inline-flex';
      installButton.removeAttribute('aria-hidden');
    }
  }

  function closeModal() {
    if (modalEl && modalEl.parentNode) {
      modalEl.parentNode.removeChild(modalEl);
      modalEl = null;
    }
  }

  function openFallbackInstructions() {
    closeModal();

    var overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;';

    var stepsHtml = isIOSDevice()
      ? '<ol style="margin:12px 0 0 18px;padding:0;line-height:1.6;font-size:14px;color:#e5e7eb;">' +
        '<li>Tap the <strong>Share</strong> icon in Safari.</li>' +
        '<li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>' +
        '<li>Tap <strong>Add</strong> to install SHANT MATKA.</li>' +
        '</ol>'
      : isSamsungBrowser()
      ? '<ol style="margin:12px 0 0 18px;padding:0;line-height:1.6;font-size:14px;color:#e5e7eb;">' +
        '<li>Tap the <strong>Menu</strong> icon in Samsung Internet.</li>' +
        '<li>Select <strong>Add page to</strong> &gt; <strong>Home screen</strong>.</li>' +
        '<li>Confirm <strong>Add</strong> to install SHANT MATKA.</li>' +
        '</ol>'
      : '<ol style="margin:12px 0 0 18px;padding:0;line-height:1.6;font-size:14px;color:#e5e7eb;">' +
        '<li>Tap the <strong>Chrome menu (⋮)</strong> in the top-right corner.</li>' +
        '<li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li>' +
        '<li>Tap <strong>Install</strong> when Android asks for confirmation.</li>' +
        '</ol>';

    var box = document.createElement('div');
    box.style.cssText =
      'width:100%;max-width:360px;background:#160000;border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:20px;color:#ffffff;box-shadow:0 20px 45px rgba(0,0,0,0.5);';

    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
      '<strong style="font-size:16px;">Install SHANT MATKA App</strong>' +
      '<button type="button" id="shant-pwa-close" aria-label="Close" style="background:none;border:0;color:#d1d5db;font-size:20px;cursor:pointer;line-height:1;">&times;</button>' +
      '</div>' +
      '<p style="margin:8px 0 0;font-size:13px;color:#d1d5db;">Follow these steps to install the app on your device:</p>' +
      stepsHtml +
      '<button type="button" id="shant-pwa-ok" style="margin-top:16px;width:100%;min-height:42px;border:0;border-radius:8px;background:#8B0000;color:#ffffff;font-size:14px;font-weight:600;cursor:pointer;">Got it</button>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    modalEl = overlay;

    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay) closeModal();
    });
    var closeBtn = document.getElementById('shant-pwa-close');
    var okBtn = document.getElementById('shant-pwa-ok');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (okBtn) okBtn.addEventListener('click', closeModal);
  }

  /* Register Service Worker safely over HTTPS */
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(function (err) {
        console.warn('[SHANT MATKA PWA] Service Worker registration failed:', err);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    showInstallButton();
  });

  /* Only confirm & hide after browser emits appinstalled */
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    closeModal();
    hideInstallButton();
  });

  document.addEventListener('DOMContentLoaded', function () {
    installButton = document.getElementById('shant-install-btn');

    if (installButton) {
      if (isStandaloneMode()) {
        hideInstallButton();
      } else {
        showInstallButton();
        installButton.addEventListener('click', function () {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function (choice) {
              if (choice && choice.outcome === 'accepted') {
                deferredPrompt = null;
                hideInstallButton();
              }
            }).catch(function () {
              openFallbackInstructions();
            });
          } else {
            openFallbackInstructions();
          }
        });
      }
    }

    /* Keep standalone navigation safe for external links */
    if (isStandaloneMode()) {
      document.addEventListener('click', function (ev) {
        var target = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
        if (!target) return;
        try {
          var linkUrl = new URL(target.href, window.location.origin);
          if (linkUrl.origin !== window.location.origin && /^https?:$/i.test(linkUrl.protocol)) {
            target.setAttribute('target', '_blank');
            target.setAttribute('rel', 'noopener noreferrer');
          }
        } catch (e) {
          /* Ignore invalid href values */
        }
      });
    }
  });
})();
`;
}

export function generateHeadSnippetHtml(): string {
  return `<!-- 1. Paste inside your existing <head>...</head> -->
<meta name="theme-color" content="#8B0000" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="SHANT MATKA" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
<script src="/pwa-install.js" defer></script>

<!-- 2. Place this Install App button anywhere in your existing header/menu/footer -->
<!-- It automatically hides when already installed in standalone mode -->
<button
  id="shant-install-btn"
  type="button"
  style="display:none;align-items:center;gap:8px;background:#8B0000;color:#ffffff;border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;"
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
  <span>Install App</span>
</button>
`;
}

export function generateHtaccessRule(): string {
  return `# Optional: Ensure cPanel Apache serves .webmanifest with the official MIME type
<IfModule mod_mime.c>
  AddType application/manifest+json .webmanifest
</IfModule>

# Never cache service-worker.js or manifest.webmanifest aggressively
<FilesMatch "^(service-worker\\.js|manifest\\.webmanifest)$">
  <IfModule mod_headers.c>
    Header set Cache-Control "no-cache, no-store, must-revalidate"
  </IfModule>
</FilesMatch>`;
}

function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateDownloadLandingHtml(
  apkDownloadPath = '/downloads/shant-matka.apk',
  config: SiteConfig = DEFAULT_SITE_CONFIG
): string {
  const safeApkPath = escapeHtmlText(apkDownloadPath.trim() || '/downloads/shant-matka.apk');
  const safeName = escapeHtmlText(config.appName || 'SHANT MATKA');
  const safeTagline = escapeHtmlText(config.tagline || 'Official VIP Android App');
  const safeDesc = escapeHtmlText(config.description || '');
  const safeRating = escapeHtmlText(config.rating || '5.0');
  const safeWebsiteUrl = escapeHtmlText(config.websiteUrl || 'https://new.rajagamevip.site/');
  const safeBtnLabel = escapeHtmlText(config.apkButtonLabel || `Download ${safeName} APK`);
  const safeTheme = escapeHtmlText(config.themeColor || '#8B0000');
  const safeBg = escapeHtmlText(config.backgroundColor || '#120000');

  let targetHost = 'new.rajagamevip.site';
  try {
    targetHost = new URL(config.websiteUrl || 'https://new.rajagamevip.site/').hostname;
  } catch {
    targetHost = 'new.rajagamevip.site';
  }

  const waDigits = (config.whatsappNumber || '').replace(/[^\d]/g, '');
  const waMsg = encodeURIComponent(config.whatsappMessage || `Hello ${config.appName} Support`);
  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${waMsg}`
    : `https://wa.me/?text=${waMsg}`;

  const ratesRows = (config.gameRates || [])
    .map(
      (r) =>
        `<div class="rate-row"><span class="rate-name">${escapeHtmlText(r.game)}</span><span class="rate-val">${escapeHtmlText(r.rate)}</span></div>`
    )
    .join('\n            ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${safeName} — Official VIP Android App Download</title>
    <meta name="description" content="${safeDesc}" />
    <meta name="theme-color" content="${safeTheme}" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="${safeName}" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <script src="/pwa-install.js" defer></script>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        min-height: 100dvh;
        background-color: ${safeBg};
        background-image: radial-gradient(ellipse at 50% 0%, rgba(139, 0, 0, 0.48) 0%, rgba(22, 0, 0, 0.92) 52%, ${safeBg} 100%);
        color: #f8fafc;
        font-family: "DM Sans", system-ui, -apple-system, sans-serif;
        line-height: 1.5;
      }
      a { color: inherit; text-decoration: none; }
      .wrap { max-width: 960px; margin: 0 auto; padding: 0 20px; }
      header {
        border-bottom: 1px solid rgba(212, 175, 55, 0.2);
        background: rgba(20, 0, 0, 0.9);
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 16px 0;
      }
      .brand {
        font-family: "Cinzel", Georgia, serif;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.05em;
        color: #f7d774;
        white-space: nowrap;
      }
      .nav-link {
        font-size: 12px;
        font-weight: 600;
        color: #f7d774;
        border: 1px solid rgba(212, 175, 55, 0.35);
        background: rgba(212, 175, 55, 0.1);
        padding: 8px 14px;
        border-radius: 8px;
        white-space: nowrap;
      }
      .hero {
        min-height: 70dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 56px 0;
      }
      .app-frame {
        border-radius: 24px;
        border: 1px solid rgba(212, 175, 55, 0.45);
        background: ${safeBg};
        padding: 6px;
        box-shadow: 0 20px 60px rgba(139, 0, 0, 0.55);
      }
      .app-icon {
        display: block;
        width: 96px;
        height: 96px;
        border-radius: 18px;
        object-fit: cover;
      }
      h1 {
        margin-top: 22px;
        font-family: "Cinzel", Georgia, serif;
        font-size: clamp(32px, 6vw, 48px);
        font-weight: 900;
        letter-spacing: 0.04em;
        color: #ffffff;
      }
      .rating {
        margin-top: 10px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: #cbd5e1;
      }
      .stars { color: #f7d774; letter-spacing: 2px; font-size: 16px; }
      .score { font-weight: 700; color: #f7d774; }
      .lead {
        margin-top: 18px;
        font-size: 16px;
        color: #e2e8f0;
        max-width: 48ch;
      }
      @keyframes vipNudge {
        0%, 55%, 100% { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        62% { transform: translate3d(0, -3px, 0) scale(1.03) rotate(-1.2deg); }
        68% { transform: translate3d(0, -3px, 0) scale(1.03) rotate(1.2deg); }
        74% { transform: translate3d(0, -2px, 0) scale(1.02) rotate(-0.8deg); }
        80% { transform: translate3d(0, 0, 0) scale(1.01) rotate(0.5deg); }
      }
      .cta-wrap { margin-top: 30px; display: flex; justify-content: center; }
      .btn-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        min-height: 64px;
        padding: 16px 44px;
        border-radius: 16px;
        background: ${safeTheme};
        color: #ffffff;
        font-size: 19px;
        font-weight: 800;
        border: 1px solid rgba(247, 215, 116, 0.6);
        box-shadow: 0 16px 44px rgba(139, 0, 0, 0.72);
        cursor: pointer;
        animation: vipNudge 2.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .btn-primary { animation: none; }
      }
      .rates-section {
        border-top: 1px solid rgba(212, 175, 55, 0.2);
        padding: 40px 0 80px;
      }
      .rates-wrap { max-width: 640px; margin: 0 auto; }
      .rates-head { text-align: center; }
      .rates-head h2 {
        font-family: "Cinzel", Georgia, serif;
        font-size: 28px;
        font-weight: 700;
        color: #f7d774;
      }
      .rates-head p { margin-top: 6px; font-size: 14px; color: #cbd5e1; }
      .rates-card {
        margin-top: 24px;
        border: 1px solid rgba(212, 175, 55, 0.3);
        border-radius: 16px;
        background: rgba(27, 3, 3, 0.9);
        overflow: hidden;
      }
      .rate-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        border-bottom: 1px solid rgba(212, 175, 55, 0.15);
      }
      .rate-row:last-child { border-bottom: 0; }
      .rate-name { font-size: 16px; font-weight: 600; color: #ffffff; }
      .rate-val { font-size: 17px; font-weight: 700; color: #f7d774; font-variant-numeric: tabular-nums; }
      .wa-fab {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 40;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 10px 16px;
        border-radius: 9999px;
        background: #189c4e;
        color: #ffffff;
        font-size: 12px;
        font-weight: 700;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.45);
      }
    </style>
  </head>
  <body>
    <header>
      <div class="wrap topbar">
        <span class="brand">${safeName}</span>
        <a class="nav-link" href="${safeWebsiteUrl}" target="_blank" rel="noopener noreferrer">Open Website</a>
      </div>
    </header>

    <main class="wrap">
      <section class="hero">
        <div class="app-frame">
          <img class="app-icon" src="/icons/icon-192.png" alt="${safeName} App Icon" />
        </div>
        <h1>${safeName}</h1>
        <div class="rating">
          <span class="stars" aria-label="5 out of 5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
          <span class="score">${safeRating}</span>
          <span>&middot;</span>
          <span>${safeTagline}</span>
        </div>
        <p class="lead">${safeDesc}</p>
        <div class="cta-wrap">
          <a class="btn-primary" href="${safeApkPath}" download="SHANT-MATKA.apk">
            ${safeBtnLabel}
          </a>
        </div>
      </section>

      <section class="rates-section" aria-label="Game Rates">
        <div class="rates-wrap">
          <div class="rates-head">
            <h2>Game Rates</h2>
            <p>Official ${safeName} payout rates</p>
          </div>
          <div class="rates-card">
            ${ratesRows}
          </div>
        </div>
      </section>
    </main>

    <a class="wa-fab" href="${waHref}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp Support">
      Support
    </a>

    <script>
      (function () {
        var isStandalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          window.navigator.standalone === true;
        var isAppLaunch = window.location.search.indexOf('launch=app') !== -1;
        if ((isStandalone || isAppLaunch) && window.location.hostname !== '${escapeHtmlText(targetHost)}') {
          document.body.innerHTML =
            '<iframe src="${safeWebsiteUrl}" title="${safeName}" allow="clipboard-read; clipboard-write; payment" style="position:fixed;inset:0;width:100vw;height:100dvh;border:0;background:#fff;"></iframe>';
        }
      })();
    </script>
  </body>
</html>
`;
}

export function generateCPanelGuideTxt(): string {
  return `====================================================================
SHANT MATKA — cPanel Download Website & PWA Deployment Guide
====================================================================

1. VERIFY HTTPS IS ACTIVE
   - Ensure your domain loads over HTTPS with a valid SSL certificate.

2. UPLOAD FILES VIA cPanel FILE MANAGER
   - Open cPanel -> File Manager -> public_html/ (or your domain root).
   - Upload all files from this ZIP directly into the domain root:
       * index.html              (the visitor-only APK/App download page)
       * manifest.webmanifest
       * service-worker.js
       * offline.html
       * pwa-install.js
   - Upload the /icons/ folder:
       * icons/icon-192.png
       * icons/icon-512.png
       * icons/icon-512-maskable.png
       * icons/apple-touch-icon.png
   - Upload your signed Android APK file to:
       * downloads/shant-matka.apk
     (If your APK has a different filename or external URL, update the
      href="..." on the Download APK button in index.html.)

3. OPTIONAL: ADD .htaccess MIME TYPE RULE
   - Enable "Show Hidden Files" in cPanel File Manager Settings, open
     .htaccess, and append the rules from htaccess-pwa-snippet.txt.
====================================================================
`;
}
