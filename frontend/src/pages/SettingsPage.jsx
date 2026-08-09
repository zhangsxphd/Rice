import { useEffect, useState } from 'react';
import { FloppyDisk, Key, Database, SlidersHorizontal, Copy, Warning } from '@phosphor-icons/react';
import { api } from '../api/client.js';
import { TopToolbar } from '../components/TopToolbar.jsx';
import { localTime } from '../utils/format.js';

const THRESHOLDS = [
  ['waterLevelW0', 'W0水位', 'mm'], ['tensionW1', 'W1张力', 'kPa'], ['tensionW2', 'W2张力', 'kPa'],
  ['soilMoisture', '含水率', '%'], ['soilTemperature', '温度', '℃'], ['soilEc', 'EC', 'μS/cm'],
  ['soilPh', 'pH', ''], ['batteryMv', '低电压', 'mV'], ['csq', '低信号', 'CSQ']
];

export function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [databaseStatus, setDatabaseStatus] = useState(null);
  const [createdKey, setCreatedKey] = useState(null);
  const [message, setMessage] = useState('');
  const load = async () => {
    try { const [data, db] = await Promise.all([api.settings(), api.databaseStatus()]); setSettings(data); setDatabaseStatus(db); setMessage(''); }
    catch (error) { setMessage(error.message); }
  };
  useEffect(() => { load(); }, []);
  if (!settings) return <main className="app-shell subpage"><TopToolbar /><div className="page-loading">正在读取系统设置…</div></main>;
  const updateGroup = (group, key, value) => setSettings({ ...settings, [group]: { ...settings[group], [key]: value } });
  const updateThreshold = (key, side, value) => setSettings({ ...settings, thresholds: { ...settings.thresholds, [key]: { ...settings.thresholds[key], [side]: value === '' ? null : Number(value) } } });
  const save = async () => { try { const patch = { experiment: settings.experiment, dashboard: settings.dashboard, ingest: settings.ingest, thresholds: settings.thresholds }; const result = await api.updateSettings(patch); setSettings({ ...result, apiKeys: settings.apiKeys }); setMessage('设置已保存'); } catch (error) { setMessage(error.message); } };
  return (
    <main className="app-shell subpage"><TopToolbar />
      <section className="page-heading"><div><span>系统设置</span><h1>试验参数与数据维护</h1><p>时区固定为Asia/Shanghai；阈值留空表示不参与异常判断。</p></div><button className="primary-button" onClick={save}><FloppyDisk />保存全部设置</button></section>
      {message ? <div className={message === '设置已保存' ? 'success-banner' : 'error-banner'}>{message}</div> : null}
      <div className="settings-layout">
        <section className="data-card"><div className="card-heading"><SlidersHorizontal /><div><h2>试验设置</h2><p>正式开始前请确认日期和自动刷新周期。</p></div></div><div className="form-grid">
          <label><span>试验名称</span><input value={settings.experiment.name || ''} onChange={(e) => updateGroup('experiment', 'name', e.target.value)} /></label>
          <label><span>开始日期</span><input type="date" value={settings.experiment.startDate || ''} onChange={(e) => updateGroup('experiment', 'startDate', e.target.value)} /></label>
          <label><span>预计结束日期</span><input type="date" value={settings.experiment.expectedEndDate || ''} onChange={(e) => updateGroup('experiment', 'expectedEndDate', e.target.value)} /></label>
          <label><span>正式数据起始时间</span><input type="datetime-local" value={settings.experiment.formalDataStartAt?.slice(0,16) || ''} onChange={(e) => updateGroup('experiment', 'formalDataStartAt', e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
          <label><span>自动刷新（秒）</span><input type="number" min="5" value={settings.dashboard.refreshSeconds} onChange={(e) => updateGroup('dashboard', 'refreshSeconds', Number(e.target.value))} /></label>
          <label><span>默认历史范围</span><select value={settings.dashboard.defaultHistoryRange} onChange={(e) => updateGroup('dashboard', 'defaultHistoryRange', e.target.value)}><option value="1h">最近1小时</option><option value="6h">6小时</option><option value="24h">24小时</option><option value="7d">7天</option></select></label>
          <label><span>上报间隔（秒）</span><input type="number" min="10" value={settings.ingest.reportIntervalSeconds} onChange={(e) => updateGroup('ingest', 'reportIntervalSeconds', Number(e.target.value))} /></label>
          <label><span>离线判定（秒）</span><input type="number" min="30" value={settings.ingest.offlineTimeoutSeconds} onChange={(e) => updateGroup('ingest', 'offlineTimeoutSeconds', Number(e.target.value))} /></label>
        </div></section>
        <section className="data-card"><div className="card-heading"><SlidersHorizontal /><div><h2>阈值设置</h2><p>张力保留原始负值，EC以数据库μS/cm设置。</p></div></div><div className="threshold-grid">{THRESHOLDS.map(([key, label, unit]) => <div key={key}><strong>{label}<small>{unit}</small></strong><label>最小<input type="number" step="any" value={settings.thresholds[key]?.min ?? ''} onChange={(e) => updateThreshold(key, 'min', e.target.value)} /></label><label>最大<input type="number" step="any" value={settings.thresholds[key]?.max ?? ''} onChange={(e) => updateThreshold(key, 'max', e.target.value)} /></label></div>)}</div></section>
        <section className="data-card"><div className="card-heading"><Key /><div><h2>设备接入</h2><p>IP 网关上报地址：/rice-api/device-ingest/d100l2</p></div><button className="outline-button" onClick={async () => { const key = await api.createApiKey('D100L设备上报'); setCreatedKey(key); await load(); }}>创建API Key</button></div>{createdKey ? <div className="created-key"><Warning weight="fill" /><span><b>仅显示一次，请立即复制</b><code>{createdKey.apiKey}</code></span><button onClick={() => navigator.clipboard?.writeText(createdKey.apiKey)}><Copy />复制</button></div> : null}<div className="key-list">{settings.apiKeys?.map((item) => <div key={item.id}><span><b>{item.name}</b><code>{item.preview}</code><small>创建 {localTime(item.createdAt, true)} · 最后使用 {localTime(item.lastUsedAt, true)}</small></span><em className={`key-${item.status}`}>{item.status}</em>{item.status === 'active' ? <button onClick={async () => { await api.revokeApiKey(item.id); await load(); }}>停用</button> : null}</div>)}</div></section>
        <section className="data-card"><div className="card-heading"><Database /><div><h2>数据维护</h2><p>清理测试数据不会删除小区、设备绑定、API Key或设置。</p></div></div><div className="maintenance-grid"><article><span>数据条数</span><b>{databaseStatus?.readings?.toLocaleString() || 0}</b></article><article><span>数据库大小</span><b>{((databaseStatus?.sizeBytes || 0) / 1024 / 1024).toFixed(2)} MB</b></article><button className="outline-button" onClick={async () => { await api.backup(); await load(); }}>创建即时备份</button><button className="danger-button" onClick={async () => { if (!window.confirm('确认删除正式起始时间之前的测试读数？')) return; await api.clearTestData(settings.experiment.formalDataStartAt); await load(); }}>清除测试数据</button></div></section>
      </div>
    </main>
  );
}
