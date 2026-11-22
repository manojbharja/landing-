import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

export type InstallOutcome = 'idle' | 'prompting' | 'accepted' | 'dismissed' | 'unavailable';

type WindowWithPWA = Window & {
  __deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
};

type NavigatorWithRelatedApps = Navigator & {
  getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string }>>;
};

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined') {
      return (window as WindowWithPWA).__deferredPWAInstallPrompt ?? null;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isAlreadyInstalledOnDevice, setIsAlreadyInstalledOnDevice] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [isSamsungInternet, setIsSamsungInternet] = useState<boolean>(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState<boolean>(false);
  const [installOutcome, setInstallOutcome] = useState<InstallOutcome>('idle');
  const [appInstalledSeq, setAppInstalledSeq] = useState<number>(0);

  useEffect(() => {
    const checkStandalone = () => {
      const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const iosStandalone =
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standaloneMedia || iosStandalone);
    };

    checkStandalone();

    const win = window as WindowWithPWA;
    if (win.__deferredPWAInstallPrompt) {
      setDeferredPrompt(win.__deferredPWAInstallPrompt);
    }

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    const android = /android/.test(ua);
    setIsAndroid(android);
    setIsSamsungInternet(/samsungbrowser/.test(ua));
    setIsInAppBrowser(
      android &&
        (/; wv\)|fbav|fban|instagram|whatsapp|telegram|snapchat|micromessenger|line\//.test(ua) ||
          (/version\/\d+\.\d+/.test(ua) && /chrome\//.test(ua) && /mobile/.test(ua)))
    );

    const navWithApps = window.navigator as NavigatorWithRelatedApps;
    if (typeof navWithApps.getInstalledRelatedApps === 'function') {
      navWithApps
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            setIsAlreadyInstalledOnDevice(true);
          }
        })
        .catch(() => undefined);
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = () => checkStandalone();
    mediaQuery.addEventListener('change', handleDisplayChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      win.__deferredPWAInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleCapturedSync = () => {
      if (win.__deferredPWAInstallPrompt) {
        setDeferredPrompt(win.__deferredPWAInstallPrompt);
      }
    };

    const handleAppInstalled = () => {
      win.__deferredPWAInstallPrompt = null;
      setIsInstalled(true);
      setIsAlreadyInstalledOnDevice(true);
      setDeferredPrompt(null);
      setInstallOutcome('accepted');
      setAppInstalledSeq((prev) => prev + 1);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-captured', handleCapturedSync);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-captured', handleCapturedSync);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    const win = typeof window !== 'undefined' ? (window as WindowWithPWA) : undefined;
    let activePrompt = deferredPrompt ?? win?.__deferredPWAInstallPrompt ?? null;

    // Wait briefly in case Service Worker finished registering and Chrome fires beforeinstallprompt right after click
    if (!activePrompt && win) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          window.removeEventListener('pwa-prompt-captured', onReady);
          window.removeEventListener('beforeinstallprompt', onReady);
          resolve();
        };
        const onReady = () => {
          activePrompt = win.__deferredPWAInstallPrompt ?? null;
          if (activePrompt) finish();
        };
        window.addEventListener('pwa-prompt-captured', onReady);
        window.addEventListener('beforeinstallprompt', onReady);
        window.setTimeout(finish, 450);
      });
      activePrompt = activePrompt ?? win.__deferredPWAInstallPrompt ?? null;
    }

    if (!activePrompt) {
      setInstallOutcome('unavailable');
      return 'unavailable';
    }

    try {
      setInstallOutcome('prompting');
      await activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      if (outcome === 'accepted') {
        if (win) win.__deferredPWAInstallPrompt = null;
        setDeferredPrompt(null);
        setInstallOutcome('accepted');
        return 'accepted';
      }
      setInstallOutcome('dismissed');
      return 'dismissed';
    } catch {
      setInstallOutcome('unavailable');
      return 'unavailable';
    }
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isAlreadyInstalledOnDevice,
    isIOS,
    isAndroid,
    isSamsungInternet,
    isInAppBrowser,
    installOutcome,
    appInstalledSeq,
    install,
  };
}
