export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const tauriWindow = window as Window & {
    __TAURI_IPC__?: (message: any) => void;
    __TAURI__?: any;
  };

  const hasIPC = typeof tauriWindow.__TAURI_IPC__ === 'function';
  const hasTauri = typeof tauriWindow.__TAURI__ !== 'undefined';
  return hasIPC || hasTauri;
}
