import { useEffect, useState } from 'react';
import { DownloadSimple, Database, Archive, Funnel } from '@phosphor-icons/react';
import { api } from '../api/client.js';
import { TopToolbar } from '../components/TopToolbar.jsx';
import { localTime } from '../utils/format.js';

export function ExportPage() {
  const [filters, setFilters] = useState({ from: '', to: '', blockCode: '', waterTreatment: '', varietyCode: '', plotCode: '' });
  const [status, setStatus] = useState({ readings: 0, sizeBytes: 0, backups: [] });
  const [message, setMessage] = useState('');
  const load = () => api.databaseStatus().then(setStatus).catch((error) => setMessage(error.message));
  useEffect(() => { load(); }, []);
  const exportUrl = () => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    return `/api/exports/readings.csv${params.size ? `?${params}` : ''}`;
  };
  const field = (label, key, children) => <label><span>{label}</span>{children || <input type="date" value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })} />}</label>;
  return (
    <main className="app-shell subpage"><TopToolbar />
      <section className="page-heading"><div><span>数据导出</span><h1>试验数据归档与备份</h1><p>CSV使用UTF-8 BOM，所有筛选均保留数据库原始单位。</p></div><a className="primary-button" href="/api/exports/readings.csv"><DownloadSimple />导出全部小区</a></section>
      {message ? <div className="error-banner">{message}</div> : null}
      <section className="export-summary"><article><Database /><span>读数总量</span><b>{status.readings.toLocaleString()}</b></article><article><Archive /><span>数据库大小</span><b>{(status.sizeBytes / 1024 / 1024).toFixed(2)} MB</b></article><article><DownloadSimple /><span>最近备份</span><b>{status.backups[0] ? localTime(status.backups[0].createdAt, true) : '暂无'}</b></article></section>
      <section className="data-card filter-card"><div className="card-heading"><Funnel /><div><h2>按条件导出</h2><p>日期按Asia/Shanghai选择，导出列包含小区设计、设备、传感器状态和脱敏原始JSON。</p></div></div><div className="filter-grid">
        {field('开始日期', 'from')}{field('结束日期', 'to')}
        {field('区组', 'blockCode', <select value={filters.blockCode} onChange={(event) => setFilters({ ...filters, blockCode: event.target.value })}><option value="">全部区组</option>{['B1','B2','B3','B4'].map((v) => <option key={v}>{v}</option>)}</select>)}
        {field('水分处理', 'waterTreatment', <select value={filters.waterTreatment} onChange={(event) => setFilters({ ...filters, waterTreatment: event.target.value })}><option value="">全部处理</option>{['W0','W1','W2'].map((v) => <option key={v}>{v}</option>)}</select>)}
        {field('品种', 'varietyCode', <select value={filters.varietyCode} onChange={(event) => setFilters({ ...filters, varietyCode: event.target.value })}><option value="">全部品种</option><option>V1</option><option>V2</option></select>)}
        {field('小区', 'plotCode', <select value={filters.plotCode} onChange={(event) => setFilters({ ...filters, plotCode: event.target.value })}><option value="">全部小区</option>{Array.from({ length: 24 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`).map((v) => <option key={v}>{v}</option>)}</select>)}
      </div><a className="primary-button export-action" href={exportUrl()}><DownloadSimple />导出筛选结果CSV</a></section>
      <section className="data-card"><div className="card-heading"><Archive /><div><h2>SQLite备份</h2><p>通过SQLite在线备份API生成一致性快照，并同时生成CSV。</p></div><button className="outline-button" onClick={async () => { await api.backup(); await load(); }}>创建即时备份</button></div><div className="backup-list">{status.backups.length ? status.backups.map((item) => <div key={item.id}><span><b>{item.filename}</b><small>{localTime(item.createdAt, true)} · {(item.sizeBytes / 1024).toFixed(1)} KB</small></span><a className="outline-button" href={`/api/exports/database-backup?id=${item.id}`}><DownloadSimple />下载</a></div>) : <p className="empty-cell">暂无备份记录</p>}</div></section>
    </main>
  );
}
