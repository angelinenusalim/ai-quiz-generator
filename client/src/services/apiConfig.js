// Public backend address used by the original website. This is not an API key.
export const DEFAULT_API_BASE_URL = 'https://divine-achievement-production-5191.up.railway.app';

export function resolveApiBaseUrl(value) {
  const configured = value?.trim();
  // Explicit "/" opts into the Vite local proxy or same-origin production hosting.
  return (configured || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}
