async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload?.error?.message || `请求失败（${response.status}）`);
  return payload.data;
}

export const api = {
  overview: () => request('/dashboard/overview'),
  summaryTrends: (range = '24h') => request(`/dashboard/summary-trends?range=${range}`),
  plotHistory: (plotCode, range) => request(`/plots/${plotCode}/history?range=${range}`),
  plotRecent: (plotCode, limit = 10) => request(`/plots/${plotCode}/recent?limit=${limit}`),
  plots: () => request('/plots'),
  devices: () => request('/devices'),
  bindPlot: (plotCode, body) => request(`/plots/${plotCode}/bind`, { method: 'POST', body: JSON.stringify(body) }),
  unbindPlot: (plotCode) => request(`/plots/${plotCode}/unbind`, { method: 'POST', body: '{}' }),
  updateDevice: (id, body) => request(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  lastIngest: (id) => request(`/devices/${id}/last-ingest`),
  settings: () => request('/settings'),
  updateSettings: (body) => request('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  createApiKey: (name) => request('/settings/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
  revokeApiKey: (id) => request(`/settings/api-keys/${id}/revoke`, { method: 'POST', body: '{}' }),
  backup: () => request('/settings/backup', { method: 'POST', body: '{}' }),
  clearTestData: (before) => request('/settings/clear-test-data', { method: 'POST', body: JSON.stringify({ before }) }),
  databaseStatus: () => request('/settings/database-status')
};
