import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useImportExportStore } from '../state/importExportStore';
import { useProfileStore } from '../state/profileStore';
import { isTauriEnvironment } from '../utils/tauriEnvironment';
import { useLocalization } from '../hooks/useLocalization';

function encodeBundle(json: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBundle(base64: string): string {
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  } catch (error) {
    console.warn('Failed to decode bundle', error);
    return '';
  }
}

function downloadJson(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SettingsImportExport() {
  const { t } = useLocalization();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [manualJson, setManualJson] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const {
    isExporting,
    isImporting,
    lastBundle,
    lastImportResult,
    lastExportedAt,
    error,
    exportProfiles,
    importBundle,
    saveBundle,
    clearStatus,
  } = useImportExportStore((state) => ({
    isExporting: state.isExporting,
    isImporting: state.isImporting,
    lastBundle: state.lastBundle,
    lastImportResult: state.lastImportResult,
    lastExportedAt: state.lastExportedAt,
    error: state.error,
    exportProfiles: state.exportProfiles,
    importBundle: state.importBundle,
    saveBundle: state.saveBundle,
    clearStatus: state.clearStatus,
  }));

  const profiles = useProfileStore((state) => state.profiles);
  const hasProfiles = profiles.length > 0;

  const decodedExport = useMemo(() => {
    return lastBundle ? decodeBundle(lastBundle) : '';
  }, [lastBundle]);

  useEffect(() => () => clearStatus(), [clearStatus]);

  const handleExportAll = useCallback(async () => {
    setCopySuccess(null);
    setSavedPath(null);
    clearStatus();
    await exportProfiles();
  }, [exportProfiles, clearStatus]);

  const handleExportActive = useCallback(async () => {
    const activeId = useProfileStore.getState().activeProfileId;
    clearStatus();
    if (!activeId) {
      await exportProfiles();
    } else {
      await exportProfiles([activeId]);
    }
    setCopySuccess(null);
    setSavedPath(null);
  }, [exportProfiles, clearStatus]);

  const handleDownload = useCallback(async () => {
    if (!decodedExport) {
      return;
    }
    setCopySuccess(null);
    setSavedPath(null);
    const timestamp = lastExportedAt ?? new Date().toISOString();
    const filename = `autohotpie-profiles-${timestamp.replace(/[:.]/g, '-')}.json`;

    if (isTauriEnvironment()) {
      try {
        const result = await saveBundle(filename, decodedExport);
        if (result) {
          setSavedPath(result);
          setCopySuccess('saved');
        } else {
          setCopySuccess('cancelled');
        }
      } catch (saveError) {
        console.error('Failed to save export bundle', saveError);
        setCopySuccess('saveFailed');
      }
      return;
    }

    downloadJson(filename, decodedExport);
    setCopySuccess('downloaded');
  }, [decodedExport, lastExportedAt, saveBundle]);

  const handleCopy = useCallback(async () => {
    if (!decodedExport) {
      return;
    }
    try {
      await navigator.clipboard.writeText(decodedExport);
      setCopySuccess('copied');
      setSavedPath(null);
    } catch (clipboardError) {
      console.warn('Failed to copy export bundle', clipboardError);
      setCopySuccess('clipboardFailed');
      setSavedPath(null);
    }
  }, [decodedExport]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        setFileError(null);
        return;
      }
      if (file.size === 0) {
        setFileError(t('settings.importExport.fileEmpty'));
        return;
      }
      try {
        const contents = await file.text();
        setManualJson(contents);
        setFileError(null);
      } catch (readError) {
        console.error('Failed to read import file', readError);
        setFileError(t('settings.importExport.fileReadError'));
      }
    },
    [t],
  );

  const triggerFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImport = useCallback(async () => {
    setCopySuccess(null);
    setSavedPath(null);
    if (!manualJson.trim()) {
      setFileError(t('settings.importExport.provideJson'));
      return;
    }
    try {
      const base64 = encodeBundle(manualJson.trim());
      await importBundle(base64);
      setFileError(null);
      setManualJson('');
    } catch (importError) {
      console.error('Import failed', importError);
    }
  }, [manualJson, importBundle, t]);

  const hasWarnings = lastImportResult?.warnings?.length;

  if (!isTauriEnvironment()) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-sm text-white/60">
        {t('settings.importExport.desktopOnly')}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">{t('settings.importExport.exportTitle')}</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/70">{t('settings.importExport.exportDescription')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={clsx(
                'rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15',
                !hasProfiles && 'cursor-not-allowed opacity-40',
              )}
              disabled={!hasProfiles || isExporting}
              onClick={handleExportAll}
            >
              {isExporting ? t('settings.importExport.exporting') : t('settings.importExport.exportAll')}
            </button>
            <button
              type="button"
              className={clsx(
                'rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15',
                !hasProfiles && 'cursor-not-allowed opacity-40',
              )}
              disabled={!hasProfiles || isExporting}
              onClick={handleExportActive}
            >
              {isExporting ? t('settings.importExport.exportingActive') : t('settings.importExport.exportActive')}
            </button>
          </div>
        </header>

        {(decodedExport || lastExportedAt || copySuccess) && (
          <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-white/80">{t('settings.importExport.latestExport')}</p>
                <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                  {lastExportedAt ? new Date(lastExportedAt).toLocaleString() : t('settings.importExport.latestExportPending')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:border-white/20 hover:bg-white/20"
                  onClick={handleDownload}
                  disabled={!decodedExport}
                >
                  {t('settings.importExport.downloadJson')}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:border-white/20 hover:bg-white/20"
                  onClick={handleCopy}
                  disabled={!decodedExport}
                >
                  {t('settings.importExport.copyBundle')}
                </button>
              </div>
            </div>
            {copySuccess === 'copied' && (
              <p className="text-xs text-emerald-300">{t('settings.importExport.bundleCopied')}</p>
            )}
            {copySuccess === 'downloaded' && (
              <p className="text-xs text-emerald-300">{t('settings.importExport.bundleDownloaded')}</p>
            )}
            {copySuccess === 'saved' && savedPath && (
              <p className="text-xs text-emerald-300">
                {t('settings.importExport.bundleSaved')}{' '}
                <span className="font-mono text-white/80">{savedPath}</span>
              </p>
            )}
            {copySuccess === 'clipboardFailed' && (
              <p className="text-xs text-rose-300">{t('settings.importExport.clipboardFailed')}</p>
            )}
            {copySuccess === 'saveFailed' && (
              <p className="text-xs text-rose-300">{t('settings.importExport.saveFailed')}</p>
            )}
            {copySuccess === 'cancelled' && (
              <p className="text-xs text-white/60">{t('settings.importExport.saveCancelled')}</p>
            )}
            {decodedExport && (
              <details className="rounded-xl border border-white/10 bg-black/40 p-3">
                <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-white/50">
                  {t('settings.importExport.preview')}
                </summary>
                <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-[11px] text-white/70">
                  {decodedExport}
                </pre>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">{t('settings.importExport.importTitle')}</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/70">{t('settings.importExport.importDescription')}</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/10 px-5 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15"
            onClick={triggerFileDialog}
          >
            {t('settings.importExport.chooseFile')}
          </button>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <textarea
            className="min-h-[220px] rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-white/70 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/20"
            placeholder={t('settings.importExport.placeholder')}
            value={manualJson}
            onChange={(event) => setManualJson(event.target.value)}
          />
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
            <button
              type="button"
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!manualJson.trim() || isImporting}
              onClick={handleImport}
            >
              {isImporting ? t('settings.importExport.importing') : t('settings.importExport.importButton')}
            </button>
            <button
              type="button"
              className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/60 transition hover:border-white/20 hover:bg-white/10"
              onClick={() => {
                setManualJson('');
                setFileError(null);
                setCopySuccess(null);
              }}
            >
              {t('settings.importExport.clearInput')}
            </button>
            {fileError && <p className="text-xs text-rose-300">{fileError}</p>}
            {lastImportResult && (
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
                <p className="text-white/80">{t('settings.importExport.importSummary')}</p>
                <ul className="mt-2 space-y-1 text-white/60">
                  <li>
                    {t('settings.importExport.importedProfiles')}: {lastImportResult.importedProfiles}
                  </li>
                  <li>
                    {t('settings.importExport.skippedProfiles')}: {lastImportResult.skippedProfiles}
                  </li>
                </ul>
                {hasWarnings && (
                  <details className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-[0.3em]">
                      {t('settings.importExport.warnings')}
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px]">
                      {lastImportResult.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {(error || copySuccess === 'failed') && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/15 p-4 text-sm text-red-200">
          {error ?? t('settings.importExport.clipboardFailed')}
        </div>
      )}
    </div>
  );
}

export default SettingsImportExport;
