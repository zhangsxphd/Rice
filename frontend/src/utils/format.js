function isNumericValue(input) {
  return input !== null && input !== undefined && input !== '' && Number.isFinite(Number(input));
}

export function value(input, digits = 1, suffix = '') {
  return isNumericValue(input) ? `${Number(input).toFixed(digits)}${suffix}` : '—';
}

export function waterCm(mm) {
  return isNumericValue(mm) ? `${(Number(mm) / 10).toFixed(1)} cm` : '—';
}

export function batteryV(mv) {
  return isNumericValue(mv) ? `${(Number(mv) / 1000).toFixed(2)} V` : '—';
}

export function localTime(date, full = false) {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    ...(full ? { year: 'numeric', month: '2-digit', day: '2-digit' } : {}),
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(parsed).replaceAll('/', '-');
}

export function relativeTime(date) {
  if (!date) return '从未上报';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `${seconds}秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  return `${Math.floor(seconds / 86400)}天前`;
}

export const STATUS_LABELS = { normal: '正常', abnormal: '异常', missing: '缺测', offline: '离线', unbound: '未绑定' };
