import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Tauri invoke to avoid native calls during tests
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(() => Promise.resolve('0.1.0-test')),
}));
