import { STATUS_LABELS } from '../utils/format.js';

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}><i />{STATUS_LABELS[status] || status}</span>;
}
