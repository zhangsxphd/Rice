const SHANGHAI_OFFSET = '+08:00';

export function nowIso() {
  return new Date().toISOString();
}

export function parseDeviceTime(payload, receivedAt = new Date()) {
  const rawTimestamp = Number(payload.timestamp);
  let timestampDate = null;
  if (Number.isFinite(rawTimestamp) && rawTimestamp > 0) {
    const milliseconds = rawTimestamp < 100_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
    const candidate = new Date(milliseconds);
    if (!Number.isNaN(candidate.getTime())) timestampDate = candidate;
  }

  let datetimeDate = null;
  if (typeof payload.datetime === 'string' && payload.datetime.trim()) {
    const normalized = payload.datetime.trim().replace(' ', 'T');
    const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}${SHANGHAI_OFFSET}`;
    const candidate = new Date(withZone);
    if (!Number.isNaN(candidate.getTime())) datetimeDate = candidate;
  }

  const selected = timestampDate || datetimeDate || receivedAt;
  return {
    collectedAt: selected.toISOString(),
    receivedAt: receivedAt.toISOString(),
    timeSource: timestampDate ? 'timestamp' : datetimeDate ? 'datetime' : 'server_fallback',
    discrepancySeconds: timestampDate && datetimeDate
      ? Math.round(Math.abs(timestampDate.getTime() - datetimeDate.getTime()) / 1000)
      : null
  };
}

export function rangeStart(range, now = Date.now()) {
  const durations = { '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000, '7d': 604_800_000 };
  return durations[range] ? new Date(now - durations[range]).toISOString() : null;
}
