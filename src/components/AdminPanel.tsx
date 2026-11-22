import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { AnalyticsStats, GameRateItem, SiteConfig } from '../types/siteConfig';
import {
  blobToDataUrl,
  buildPwaZipBlob,
  generateIconSetFromSource,
  type GeneratedIconSet,
} from '../lib/iconProcessor';
import { buildAndroidStudioProjectZip } from '../lib/androidProjectTemplates';
import { isValidMetaPixelId } from '../lib/metaPixel';

interface AdminPanelProps {
  config: SiteConfig;
  onConfigUpdated: (next: SiteConfig) => void;
  onBackToSite: () => void;
}

const TOKEN_STORAGE_KEY = 'shant_matka_admin_token_v1';

const EMPTY_ANALYTICS: AnalyticsStats = {
  buttonClicks: 0,
  realDownloads: 0,
  apkDownloads: 0,
  pwaInstalls: 0,
  lastClickAt: null,
  lastDownloadAt: null,
  recentEvents: [],
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  config,
  onConfigUpdated,
  onBackToSite,
}) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [isVerifying, setIsVerifying] = useState<boolean>(true);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [draft, setDraft] = useState<SiteConfig>(config);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<AnalyticsStats>(EMPTY_ANALYTICS);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [confirmResetStats, setConfirmResetStats] = useState<boolean>(false);

  const [showCapiToken, setShowCapiToken] = useState<boolean>(false);
  const [isTestingMeta, setIsTestingMeta] = useState<boolean>(false);
  const [metaTestStatus, setMetaTestStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const [isUploadingApk, setIsUploadingApk] = useState<boolean>(false);
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [isExportingAndroid, setIsExportingAndroid] = useState<boolean>(false);

  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const apkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const fetchAnalytics = useCallback(async (authToken: string) => {
    setIsLoadingStats(true);
    try {
      const res = await fetch('/api/admin/analytics', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as AnalyticsStats;
        setAnalytics(data);
      }
    } catch {
      // Ignore transient refresh failure
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const fetchFullAdminConfig = useCallback(async (authToken: string) => {
    try {
      const res = await fetch('/api/admin/config', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const fullCfg = (await res.json()) as SiteConfig;
        setDraft(fullCfg);
      }
    } catch {
      // Ignore transient fetch failure
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setIsVerifying(false);
      return;
    }
    let cancelled = false;
    fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok && !cancelled) {
          sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
        } else if (res.ok && !cancelled) {
          fetchFullAdminConfig(token);
          fetchAnalytics(token);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsVerifying(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, fetchAnalytics, fetchFullAdminConfig]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Invalid password.');
        return;
      }
      sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setToken(data.token);
      setPasswordInput('');
    } catch {
      setAuthError('Failed to connect to server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  };

  const handleResetAnalytics = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/analytics/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as AnalyticsStats;
        setAnalytics(data);
        setConfirmResetStats(false);
        setSaveMessage('Download analytics counters reset to zero.');
      }
    } catch {
      setSaveError('Failed to reset analytics.');
    }
  };

  const handleTestMetaCapi = async () => {
    if (!token) return;
    setIsTestingMeta(true);
    setMetaTestStatus(null);
    try {
      const res = await fetch('/api/admin/meta/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          metaPixelId: draft.metaPixelId,
          metaCapiAccessToken: draft.metaCapiAccessToken,
          metaTestEventCode: draft.metaTestEventCode,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        detail?: string;
        fbtraceId?: string;
        error?: string;
      };
      if (!res.ok) {
        setMetaTestStatus({ ok: false, text: data.error || 'Meta test event failed.' });
        return;
      }
      setMetaTestStatus({
        ok: true,
        text: `${data.detail || 'Test Subscribe sent to Meta!'}${
          data.fbtraceId ? ` (trace: ${data.fbtraceId})` : ''
        }`,
      });
    } catch {
      setMetaTestStatus({ ok: false, text: 'Network error testing Meta Conversions API.' });
    } finally {
      setIsTestingMeta(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as SiteConfig & { error?: string };
      if (!res.ok) {
        setSaveError(data.error || 'Could not save settings.');
        return;
      }
      onConfigUpdated(data);
      setDraft(data);
      setSaveMessage('All changes saved and live on the website.');
    } catch {
      setSaveError('Network error while saving settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoFileChange = async (file: File | undefined) => {
    if (!file || !token) return;
    if (!file.type.startsWith('image/')) {
      setSaveError('Please select a PNG, JPG, WebP, or SVG image.');
      return;
    }
    setIsUploadingLogo(true);
    setSaveError(null);
    setSaveMessage(null);
    const objectUrl = URL.createObjectURL(file);
    try {
      const iconSet = await generateIconSetFromSource(objectUrl, 15, true);
      const [icon192, icon512, icon512Maskable, appleTouch] = await Promise.all([
        blobToDataUrl(iconSet.icon192Blob),
        blobToDataUrl(iconSet.icon512Blob),
        blobToDataUrl(iconSet.icon512MaskableBlob),
        blobToDataUrl(iconSet.appleTouchBlob),
      ]);

      URL.revokeObjectURL(iconSet.icon192Url);
      URL.revokeObjectURL(iconSet.icon512Url);
      URL.revokeObjectURL(iconSet.icon512MaskableUrl);
      URL.revokeObjectURL(iconSet.appleTouchUrl);

      const res = await fetch('/api/admin/upload-icons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ icon192, icon512, icon512Maskable, appleTouch }),
      });
      const data = (await res.json()) as SiteConfig & { error?: string };
      if (!res.ok) {
        setSaveError(data.error || 'Logo upload failed.');
        return;
      }
      onConfigUpdated(data);
      setDraft(data);
      setSaveMessage('New app logo uploaded and applied across site & manifest.');
    } catch {
      setSaveError('Failed to process or upload logo.');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setIsUploadingLogo(false);
    }
  };

  const handleResetLogo = async () => {
    if (!token) return;
    setSaveError(null);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/reset-logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as SiteConfig & { error?: string };
      if (!res.ok) {
        setSaveError(data.error || 'Could not reset logo.');
        return;
      }
      onConfigUpdated(data);
      setDraft(data);
      setSaveMessage('Reset app logo to default crest.');
    } catch {
      setSaveError('Network error while resetting logo.');
    }
  };

  const handleApkUpload = async (file: File | undefined) => {
    if (!file || !token) return;
    if (!file.name.toLowerCase().endsWith('.apk')) {
      setSaveError('Please choose a valid .apk file.');
      return;
    }
    setIsUploadingApk(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/upload-apk', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      });
      const data = (await res.json()) as { config?: SiteConfig; sizeBytes?: number; error?: string };
      if (!res.ok || !data.config) {
        setSaveError(data.error || 'APK upload failed.');
        return;
      }
      onConfigUpdated(data.config);
      setDraft(data.config);
      const mb = ((data.sizeBytes || file.size) / (1024 * 1024)).toFixed(1);
      setSaveMessage(`Uploaded APK (${mb} MB). Visitors will now download it directly.`);
    } catch {
      setSaveError('Failed to upload APK file.');
    } finally {
      setIsUploadingApk(false);
    }
  };

  const handleAddRate = () => {
    const newItem: GameRateItem = {
      id: `rate-${Date.now()}`,
      game: '',
      rate: '10 - ',
    };
    setDraft((prev) => ({ ...prev, gameRates: [...prev.gameRates, newItem] }));
  };

  const handleUpdateRate = (index: number, field: 'game' | 'rate', value: string) => {
    setDraft((prev) => ({
      ...prev,
      gameRates: prev.gameRates.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };

  const handleRemoveRate = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      gameRates: prev.gameRates.filter((_, i) => i !== index),
    }));
  };

  const buildCurrentIcons = async (): Promise<GeneratedIconSet> => {
    const source = draft.icon512Url || '/icons/icon.svg';
    return generateIconSetFromSource(source, 15, source.startsWith('/uploads/'));
  };

  const handleExportWebsiteZip = async () => {
    setIsExportingZip(true);
    setSaveError(null);
    try {
      const iconSet = await buildCurrentIcons();
      const blob = await buildPwaZipBlob(iconSet, { config: draft, apkUrl: draft.apkUrl });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SHANT-MATKA-Download-Site-cPanel.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSaveMessage('Exported updated cPanel website ZIP.');
    } catch {
      setSaveError('Failed to export website ZIP.');
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportAndroidZip = async () => {
    setIsExportingAndroid(true);
    setSaveError(null);
    try {
      const iconSet = await buildCurrentIcons();
      const blob = await buildAndroidStudioProjectZip(iconSet, draft);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SHANT-MATKA-Android-APK-Source.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSaveMessage('Exported updated Android Studio APK project ZIP.');
    } catch {
      setSaveError('Failed to export Android Studio project ZIP.');
    } finally {
      setIsExportingAndroid(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setPasswordMsg(null);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        setPasswordMsg(data.error || 'Could not update password.');
        return;
      }
      if (data.token) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        setToken(data.token);
      }
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMsg('Admin password updated successfully.');
    } catch {
      setPasswordMsg('Network error updating password.');
    }
  };

  if (isVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        <p className="text-sm font-medium">Checking admin session...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-900">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h1 className="font-sans text-xl font-bold text-slate-900">Admin Panel Login</h1>
            <button
              type="button"
              onClick={onBackToSite}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Site
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to view click &amp; download analytics, connect Meta Pixel, and edit app settings.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-700">
                Admin Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter admin password"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Default initial password: <code className="font-mono text-slate-700">admin123</code> (change inside panel after login).
              </p>
            </div>

            {authError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full rounded-lg bg-[#8B0000] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#a30808] disabled:opacity-50 cursor-pointer"
            >
              {isLoggingIn ? 'Signing in...' : 'Sign In to Admin Panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const completionRate =
    analytics.buttonClicks > 0
      ? Math.round((analytics.realDownloads / analytics.buttonClicks) * 100)
      : 0;
  const pixelConnected = isValidMetaPixelId(draft.metaPixelId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-4">
            <span className="font-sans text-base font-bold text-slate-900 whitespace-nowrap">
              {draft.appName || 'SHANT MATKA'} Admin
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onBackToSite}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              View Live Site
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8">
        {saveMessage && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {saveError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            {saveError}
          </div>
        )}

        {/* Section 0: Real-Time Download & Click Analytics */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-sans text-base font-bold text-slate-900">
                Download &amp; Install Analytics
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Tracks every download button click vs. verified completed downloads/installs on user devices.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => token && fetchAnalytics(token)}
                disabled={isLoadingStats}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {!confirmResetStats ? (
                <button
                  type="button"
                  onClick={() => setConfirmResetStats(true)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Reset Stats
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleResetAnalytics}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetStats(false)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Download Button Clicks</span>
                <MousePointerClick className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums">
                {analytics.buttonClicks}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Last click: {formatDateTime(analytics.lastClickAt)}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span>Real Downloads on Phones</span>
                <Smartphone className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="mt-2 font-mono text-3xl font-bold text-emerald-900 tabular-nums">
                {analytics.realDownloads}
              </p>
              <p className="mt-1 font-mono text-xs text-emerald-800 tabular-nums">
                APK: {analytics.apkDownloads} · PWA: {analytics.pwaInstalls}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Verified Completion Rate</span>
                <Activity className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums">
                {completionRate}%
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Last verified: {formatDateTime(analytics.lastDownloadAt)}
              </p>
            </div>
          </div>

          {analytics.recentEvents.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-3.5 py-2.5">Clicked At</th>
                    <th className="px-3.5 py-2.5">Mode</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5">Meta Subscribe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {analytics.recentEvents.slice(0, 10).map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-50/70">
                      <td className="px-3.5 py-2 font-mono text-slate-700">
                        {formatDateTime(evt.clickedAt)}
                      </td>
                      <td className="px-3.5 py-2 font-mono uppercase text-slate-800">
                        {evt.mode}
                      </td>
                      <td className="px-3.5 py-2">
                        <span
                          className={
                            evt.status === 'completed'
                              ? 'font-semibold text-emerald-700'
                              : evt.status === 'aborted'
                              ? 'font-semibold text-red-700'
                              : 'font-medium text-amber-700'
                          }
                        >
                          {evt.status === 'completed'
                            ? 'Completed'
                            : evt.status === 'aborted'
                            ? 'Cancelled'
                            : evt.status === 'downloading'
                            ? 'Downloading'
                            : 'Clicked'}
                        </span>
                      </td>
                      <td className="px-3.5 py-2 font-medium text-slate-700">
                        {evt.status === 'completed' ? (
                          <div className="space-y-0.5">
                            <span>
                              {evt.capiStatus === 'sent'
                                ? 'CAPI + Pixel Sent (Subscribe)'
                                : evt.capiStatus === 'error'
                                ? `CAPI Error (${evt.capiDetail || 'Check token'})`
                                : pixelConnected
                                ? 'Pixel Subscribe Eligible'
                                : 'No Pixel ID'}
                            </span>
                          </div>
                        ) : (
                          'Not Fired'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {!draft.apkUrl && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <strong>APK File Not Set:</strong> Upload your signed <code className="font-mono">.apk</code> file or paste an APK download link below so visitors clicking the main button download the APK immediately instead of seeing Chrome&apos;s PWA install guide.
          </div>
        )}

        {/* Section 1: App Logo & APK Upload */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-sans text-base font-bold text-slate-900">App Logo &amp; Icons</h2>
            <p className="mt-1 text-xs text-slate-500">
              Updates the logo on the download page, Android PWA manifest, and exported ZIPs.
            </p>
            <div className="mt-4 flex items-center gap-4">
              <img
                src={draft.logoUrl || '/icons/icon-192.png'}
                alt="Current app logo"
                className="h-16 w-16 rounded-xl border border-slate-200 bg-[#160000] object-cover"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#8B0000] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#a30808] disabled:opacity-50 cursor-pointer"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {isUploadingLogo ? 'Uploading...' : 'Upload New Logo'}
                </button>
                <button
                  type="button"
                  onClick={handleResetLogo}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => handleLogoFileChange(e.target.files?.[0])}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-sans text-base font-bold text-slate-900">Upload APK File</h2>
            <p className="mt-1 text-xs text-slate-500">
              Upload your signed <code className="font-mono">.apk</code> file so every tap downloads the APK directly on Android without Chrome menu popups.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => apkInputRef.current?.click()}
                disabled={isUploadingApk}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <FileUp className="h-4 w-4" />
                {isUploadingApk ? 'Uploading APK...' : 'Upload .apk File'}
              </button>
              {draft.apkUrl && (
                <button
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, apkUrl: '' }))}
                  className="text-xs font-medium text-red-700 hover:underline cursor-pointer"
                >
                  Clear APK URL
                </button>
              )}
              <input
                ref={apkInputRef}
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className="hidden"
                onChange={(e) => handleApkUpload(e.target.files?.[0])}
              />
            </div>
            <p className="mt-2.5 truncate font-mono text-xs text-slate-500">
              Current APK URL: {draft.apkUrl || 'None (uses Chrome PWA Install)'}
            </p>
          </div>
        </div>

        {/* Section 2: Main Configuration + Meta Pixel Form */}
        <form onSubmit={handleSaveConfig} className="space-y-8">
          {/* Meta Pixel & Conversions API Integration */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-sans text-base font-bold text-slate-900">
                  Meta Pixel &amp; Conversions API (CAPI)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sends <code className="font-mono font-semibold text-slate-800">Subscribe</code> via both Browser Pixel &amp; Server Conversions API (with matching <code className="font-mono">event_id</code> deduplication) strictly after real APK download completes on the user&apos;s phone.
                </p>
              </div>
              <span
                className={`text-xs font-semibold ${
                  pixelConnected && draft.metaCapiAccessToken
                    ? 'text-emerald-700'
                    : pixelConnected
                    ? 'text-amber-700'
                    : 'text-slate-500'
                }`}
              >
                {pixelConnected && draft.metaCapiAccessToken
                  ? 'Pixel + CAPI Ready'
                  : pixelConnected
                  ? 'Browser Pixel Only'
                  : 'Not Connected'}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cfg-meta-pixel" className="block text-xs font-semibold text-slate-700">
                  Meta Pixel ID
                </label>
                <input
                  id="cfg-meta-pixel"
                  type="text"
                  inputMode="numeric"
                  value={draft.metaPixelId}
                  onChange={(e) => setDraft({ ...draft, metaPixelId: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="e.g. 123456789012345"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-meta-test-code" className="block text-xs font-semibold text-slate-700">
                  Test Event Code (Sirf Testing Ke Liye — Optional)
                </label>
                <input
                  id="cfg-meta-test-code"
                  type="text"
                  value={draft.metaTestEventCode}
                  onChange={(e) => setDraft({ ...draft, metaTestEventCode: e.target.value })}
                  placeholder="e.g. TEST12345 (clear when live)"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="cfg-meta-capi-token" className="block text-xs font-semibold text-slate-700">
                  Conversions API Access Token
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="cfg-meta-capi-token"
                    type={showCapiToken ? 'text' : 'password'}
                    value={draft.metaCapiAccessToken}
                    onChange={(e) => setDraft({ ...draft, metaCapiAccessToken: e.target.value })}
                    placeholder="Paste Meta Events Manager Conversions API Access Token"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#8B0000] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCapiToken((prev) => !prev)}
                    aria-label={showCapiToken ? 'Hide access token' : 'Show access token'}
                    className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    {showCapiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-4 pt-1">
                <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.trackPageViewOnLoad}
                    onChange={(e) => setDraft({ ...draft, trackPageViewOnLoad: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 accent-[#8B0000]"
                  />
                  <span>Also fire PageView on page load (keep off for Subscribe-only tracking)</span>
                </label>

                <button
                  type="button"
                  onClick={handleTestMetaCapi}
                  disabled={isTestingMeta || !pixelConnected || !draft.metaCapiAccessToken.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-45 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isTestingMeta ? 'Sending Test...' : 'Send Test Subscribe Event'}</span>
                </button>
              </div>
            </div>

            {metaTestStatus && (
              <div
                role="status"
                className={`mt-4 rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
                  metaTestStatus.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {metaTestStatus.text}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-sans text-base font-bold text-slate-900">
              App Identity, URLs &amp; Support
            </h2>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="cfg-app-name" className="block text-xs font-semibold text-slate-700">
                  App Name
                </label>
                <input
                  id="cfg-app-name"
                  type="text"
                  required
                  value={draft.appName}
                  onChange={(e) => setDraft({ ...draft, appName: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-short-name" className="block text-xs font-semibold text-slate-700">
                  Short Name (Home Screen ≤ 12 chars)
                </label>
                <input
                  id="cfg-short-name"
                  type="text"
                  maxLength={12}
                  required
                  value={draft.shortName}
                  onChange={(e) => setDraft({ ...draft, shortName: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-tagline" className="block text-xs font-semibold text-slate-700">
                  Subtitle / Tagline
                </label>
                <input
                  id="cfg-tagline"
                  type="text"
                  value={draft.tagline}
                  onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-rating" className="block text-xs font-semibold text-slate-700">
                  Star Rating Display
                </label>
                <input
                  id="cfg-rating"
                  type="text"
                  value={draft.rating}
                  onChange={(e) => setDraft({ ...draft, rating: e.target.value })}
                  placeholder="5.0"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="cfg-desc" className="block text-xs font-semibold text-slate-700">
                  Hero Description
                </label>
                <textarea
                  id="cfg-desc"
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-website-url" className="block text-xs font-semibold text-slate-700">
                  Target Website URL (Opens inside App)
                </label>
                <input
                  id="cfg-website-url"
                  type="url"
                  required
                  value={draft.websiteUrl}
                  onChange={(e) => setDraft({ ...draft, websiteUrl: e.target.value })}
                  placeholder="https://new.rajagamevip.site/"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-apk-url" className="block text-xs font-semibold text-slate-700">
                  APK Download URL (Direct .apk link)
                </label>
                <input
                  id="cfg-apk-url"
                  type="text"
                  value={draft.apkUrl}
                  onChange={(e) => setDraft({ ...draft, apkUrl: e.target.value })}
                  placeholder="https://.../shant-matka.apk or leave empty for PWA"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-btn-label" className="block text-xs font-semibold text-slate-700">
                  Download / Install Button Label
                </label>
                <input
                  id="cfg-btn-label"
                  type="text"
                  value={draft.apkButtonLabel}
                  onChange={(e) => setDraft({ ...draft, apkButtonLabel: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-wa-number" className="block text-xs font-semibold text-slate-700">
                  WhatsApp Support Number (with country code, e.g. 919876543210)
                </label>
                <input
                  id="cfg-wa-number"
                  type="text"
                  value={draft.whatsappNumber}
                  onChange={(e) => setDraft({ ...draft, whatsappNumber: e.target.value })}
                  placeholder="919876543210"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="cfg-wa-msg" className="block text-xs font-semibold text-slate-700">
                  WhatsApp Pre-filled Message
                </label>
                <input
                  id="cfg-wa-msg"
                  type="text"
                  value={draft.whatsappMessage}
                  onChange={(e) => setDraft({ ...draft, whatsappMessage: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cfg-theme-color" className="block text-xs font-semibold text-slate-700">
                    Theme Color
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id="cfg-theme-color"
                      type="color"
                      value={draft.themeColor}
                      onChange={(e) => setDraft({ ...draft, themeColor: e.target.value })}
                      className="h-9 w-10 rounded border border-slate-300 bg-white p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={draft.themeColor}
                      onChange={(e) => setDraft({ ...draft, themeColor: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cfg-bg-color" className="block text-xs font-semibold text-slate-700">
                    Background Color
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id="cfg-bg-color"
                      type="color"
                      value={draft.backgroundColor}
                      onChange={(e) => setDraft({ ...draft, backgroundColor: e.target.value })}
                      className="h-9 w-10 rounded border border-slate-300 bg-white p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={draft.backgroundColor}
                      onChange={(e) => setDraft({ ...draft, backgroundColor: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono text-xs text-slate-900"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Game Rates Editor */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-sans text-base font-bold text-slate-900">Game Rates</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Add, edit, or remove game rates shown on the download page.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddRate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Rate
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {draft.gameRates.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={item.game}
                    onChange={(e) => handleUpdateRate(idx, 'game', e.target.value)}
                    placeholder="Game Name (e.g. Single Digit)"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#8B0000] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={item.rate}
                    onChange={(e) => handleUpdateRate(idx, 'rate', e.target.value)}
                    placeholder="10 - 100"
                    className="w-36 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#8B0000] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveRate(idx)}
                    aria-label="Remove game rate"
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-[#8B0000] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#a30808] disabled:opacity-50 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                <span>{isSaving ? 'Saving...' : 'Save All Changes'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Section 4: Export Packages & Admin Password */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-sans text-base font-bold text-slate-900">
              Export Updated Packages
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Export static cPanel website files or the Android Studio WebView APK project using your saved settings above.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportWebsiteZip}
                disabled={isExportingZip}
                className="inline-flex items-center gap-2 rounded-lg bg-[#8B0000] px-4 py-2 text-xs font-semibold text-white hover:bg-[#a30808] disabled:opacity-50 cursor-pointer"
              >
                <Archive className="h-4 w-4" />
                {isExportingZip ? 'Exporting...' : 'Export cPanel Website ZIP'}
              </button>
              <button
                type="button"
                onClick={handleExportAndroidZip}
                disabled={isExportingAndroid}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <Smartphone className="h-4 w-4" />
                {isExportingAndroid ? 'Exporting...' : 'Export Android APK Project'}
              </button>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="flex items-center gap-2 font-sans text-base font-bold text-slate-900">
              <KeyRound className="h-4 w-4 text-slate-700" />
              Change Admin Password
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#8B0000] focus:outline-none"
              />
              <input
                type="password"
                required
                minLength={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 4 chars)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#8B0000] focus:outline-none"
              />
            </div>
            {passwordMsg && (
              <p className="mt-2 text-xs font-medium text-slate-700">{passwordMsg}</p>
            )}
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};
