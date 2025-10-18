export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const tauriWindow = window as Window & {
    __TAURI_IPC__?: (message: any) => void;
  };

  return typeof tauriWindow.__TAURI_IPC__ === 'function';
}
