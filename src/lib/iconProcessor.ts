import JSZip from 'jszip';
import type { SiteConfig } from '../types/siteConfig';
import { DEFAULT_SITE_CONFIG } from '../types/siteConfig';
import {
  generateCPanelGuideTxt,
  generateDownloadLandingHtml,
  generateHeadSnippetHtml,
  generateHtaccessRule,
  generateInstallScriptJs,
  generateManifestWebmanifest,
  generateOfflineHtml,
  generateServiceWorkerJs,
} from './pwaTemplates';

export interface GeneratedIconSet {
  icon192Url: string;
  icon512Url: string;
  icon512MaskableUrl: string;
  appleTouchUrl: string;
  icon192Blob: Blob;
  icon512Blob: Blob;
  icon512MaskableBlob: Blob;
  appleTouchBlob: Blob;
  isCustomLogo: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to encode PNG blob from canvas'));
      }
    }, 'image/png');
  });
}

function renderIconToCanvas(
  img: HTMLImageElement,
  size: number,
  paddingRatio: number,
  backgroundColor: string
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fill solid background (#160000)
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);

  const safeMargin = Math.round(size * paddingRatio);
  const availableSize = size - safeMargin * 2;

  const srcW = img.naturalWidth || img.width || size;
  const srcH = img.naturalHeight || img.height || size;
  const scale = Math.min(availableSize / srcW, availableSize / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const drawX = (size - drawW) / 2;
  const drawY = (size - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  return canvas;
}

export async function generateIconSetFromSource(
  sourceUrl: string,
  maskablePaddingPercent: number,
  isCustomLogo: boolean,
  anyPaddingPercent = 4
): Promise<GeneratedIconSet> {
  const img = await loadImage(sourceUrl);
  const bgColor = '#160000';

  const anyPad = isCustomLogo ? anyPaddingPercent / 100 : 0;
  const maskablePad = maskablePaddingPercent / 100;

  const c192 = renderIconToCanvas(img, 192, anyPad, bgColor);
  const c512 = renderIconToCanvas(img, 512, anyPad, bgColor);
  const cMaskable = renderIconToCanvas(img, 512, maskablePad, bgColor);
  const cApple = renderIconToCanvas(img, 180, anyPad, bgColor);

  const [icon192Blob, icon512Blob, icon512MaskableBlob, appleTouchBlob] = await Promise.all([
    canvasToBlob(c192),
    canvasToBlob(c512),
    canvasToBlob(cMaskable),
    canvasToBlob(cApple),
  ]);

  return {
    icon192Url: URL.createObjectURL(icon192Blob),
    icon512Url: URL.createObjectURL(icon512Blob),
    icon512MaskableUrl: URL.createObjectURL(icon512MaskableBlob),
    appleTouchUrl: URL.createObjectURL(appleTouchBlob),
    icon192Blob,
    icon512Blob,
    icon512MaskableBlob,
    appleTouchBlob,
    isCustomLogo,
  };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read blob as data URL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

export interface ZipExportOptions {
  apkFile?: File | null;
  apkUrl?: string;
  config?: SiteConfig;
}

export async function buildPwaZipBlob(
  icons: GeneratedIconSet,
  options: ZipExportOptions = {}
): Promise<Blob> {
  const zip = new JSZip();
  const cfg = options.config ?? DEFAULT_SITE_CONFIG;

  const resolvedApkPath = options.apkFile
    ? '/downloads/shant-matka.apk'
    : options.apkUrl?.trim() || cfg.apkUrl?.trim() || '/downloads/shant-matka.apk';

  zip.file('index.html', generateDownloadLandingHtml(resolvedApkPath, cfg));
  zip.file('manifest.webmanifest', generateManifestWebmanifest(cfg));
  zip.file('service-worker.js', generateServiceWorkerJs());
  zip.file('offline.html', generateOfflineHtml());
  zip.file('pwa-install.js', generateInstallScriptJs());
  zip.file('HEAD_SNIPPET.html', generateHeadSnippetHtml());
  zip.file('htaccess-pwa-snippet.txt', generateHtaccessRule());
  zip.file('CPANEL_INSTALL_GUIDE.txt', generateCPanelGuideTxt());

  const iconsFolder = zip.folder('icons');
  if (iconsFolder) {
    iconsFolder.file('icon-192.png', icons.icon192Blob);
    iconsFolder.file('icon-512.png', icons.icon512Blob);
    iconsFolder.file('icon-512-maskable.png', icons.icon512MaskableBlob);
    iconsFolder.file('apple-touch-icon.png', icons.appleTouchBlob);
  }

  if (options.apkFile) {
    const downloadsFolder = zip.folder('downloads');
    if (downloadsFolder) {
      downloadsFolder.file('shant-matka.apk', options.apkFile);
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
