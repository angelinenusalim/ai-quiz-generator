import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_API_BASE_URL, resolveApiBaseUrl } from './apiConfig.js';
import { requestQuiz } from './api.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('keeps the existing Railway API as the default for development and Netlify builds', () => {
  expect(resolveApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
  expect(resolveApiBaseUrl('')).toBe(DEFAULT_API_BASE_URL);
  expect(resolveApiBaseUrl('  ')).toBe(DEFAULT_API_BASE_URL);
  expect(resolveApiBaseUrl('/')).toBe('');
  expect(resolveApiBaseUrl(' https://custom-api.example.com/ ')).toBe('https://custom-api.example.com');
});
it('sends requests to the existing Railway backend when no frontend override is set', async () => {
  vi.stubEnv('VITE_API_BASE_URL', '');
  const fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: { message: 'test request rejected' } }) }));
  vi.stubGlobal('fetch', fetch);
  await expect(requestQuiz({ topic: 'Operating Systems' }, [])).rejects.toThrow('test request rejected');
  expect(fetch.mock.calls[0][0]).toBe(`${DEFAULT_API_BASE_URL}/api/generate`);
});
it('explains the deployment mismatch without attempting fragile legacy-text parsing', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ quiz: 'Old Markdown quiz response' }) })));
  await expect(requestQuiz({ topic: 'Operating Systems' }, [])).rejects.toThrow('Deploy the updated server to Railway');
});
