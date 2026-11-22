type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: (...args: unknown[]) => void;
  loaded?: boolean;
  version?: string;
};

type WindowWithFbq = Window & {
  fbq?: FbqFn;
  _fbq?: FbqFn;
};

export interface MetaBrowserContext {
  fbp: string;
  fbc: string;
  eventSourceUrl: string;
}

const initializedPixelIds = new Set<string>();
const pageViewTrackedIds = new Set<string>();
const firedSubscribeEventIds = new Set<string>();

export function isValidMetaPixelId(pixelId: string | undefined | null): boolean {
  return typeof pixelId === 'string' && /^\d{8,20}$/.test(pixelId.trim());
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`).exec(document.cookie || '');
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Extracts Meta browser matching parameters (_fbp, _fbc, and source URL)
 * so server-side Conversions API matches and deduplicates cleanly with Browser Pixel.
 */
export function getMetaBrowserContext(): MetaBrowserContext {
  if (typeof window === 'undefined') {
    return { fbp: '', fbc: '', eventSourceUrl: '' };
  }
  const fbp = readCookie('_fbp');
  let fbc = readCookie('_fbc');
  if (!fbc) {
    try {
      const fbclid = new URLSearchParams(window.location.search).get('fbclid');
      if (fbclid) {
        fbc = `fb.1.${Date.now()}.${fbclid}`;
      }
    } catch {
      // Ignore URL parsing errors
    }
  }
  return {
    fbp,
    fbc,
    eventSourceUrl: window.location.href,
  };
}

function ensureFbqBootstrapped(): FbqFn | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  const win = window as WindowWithFbq;
  if (!win.fbq) {
    const fbq: FbqFn = function (...args: unknown[]) {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
      } else {
        fbq.queue = fbq.queue || [];
        fbq.queue.push(args);
      }
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.push = fbq;
    win.fbq = fbq;
    if (!win._fbq) {
      win._fbq = fbq;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="connect.facebook.net/en_US/fbevents.js"]'
    );
    if (!existingScript) {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      const firstScript = document.getElementsByTagName('script')[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        document.head.appendChild(script);
      }
    }
  }
  return win.fbq;
}

/**
 * Connects Meta Pixel on the public download page.
 * Does NOT fire Subscribe! Subscribe is strictly gated behind verified download/install completion.
 */
export function initMetaPixel(pixelId: string, trackPageView: boolean): void {
  const cleanId = (pixelId || '').trim();
  if (!isValidMetaPixelId(cleanId)) return;

  const fbq = ensureFbqBootstrapped();
  if (!fbq) return;

  if (!initializedPixelIds.has(cleanId)) {
    fbq('init', cleanId);
    initializedPixelIds.add(cleanId);
  }

  if (trackPageView && !pageViewTrackedIds.has(cleanId)) {
    fbq('track', 'PageView');
    pageViewTrackedIds.add(cleanId);
  }
}

/**
 * Fires Meta Pixel Subscribe event ONLY after verified real APK download or WebAPK install completion.
 */
export function fireMetaPixelSubscribe(
  pixelId: string,
  appName: string,
  eventId: string
): boolean {
  const cleanId = (pixelId || '').trim();
  if (!isValidMetaPixelId(cleanId)) return false;

  const dedupeKey = `${cleanId}:${eventId}`;
  if (firedSubscribeEventIds.has(dedupeKey)) {
    return false;
  }

  const fbq = ensureFbqBootstrapped();
  if (!fbq) return false;

  if (!initializedPixelIds.has(cleanId)) {
    fbq('init', cleanId);
    initializedPixelIds.add(cleanId);
  }

  fbq(
    'track',
    'Subscribe',
    {
      content_name: appName || 'SHANT MATKA',
      content_category: 'Android App',
      value: 0,
      currency: 'INR',
    },
    { eventID: eventId }
  );

  firedSubscribeEventIds.add(dedupeKey);
  return true;
}
