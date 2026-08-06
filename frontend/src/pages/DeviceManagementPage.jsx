import { useEffect, useMemo, useState } from 'react';
import { LinkSimple, LinkBreak, ClipboardText, Eye, ToggleLeft, ToggleRight } from '@phosphor-icons/react';
import { api } from '../api/client.js';
import { TopToolbar } from '../components/TopToolbar.jsx';
import { Modal } from '../components/Modal.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { batteryV, localTime, value } from '../utils/format.js';

export function DeviceManagementPage() {
  const [plots, setPlots] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ imei: '', alias: '' });
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [log, setLog] = useState(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    try { const [plotRows, deviceRows] = await Promise.all([api.plots(), api.devices()]); setPlots(plotRows); setDevices(deviceRows); setMessage(''); }
    catch (error) { setMessage(error.message); }
  };
  useEffect(() => { load(); }, []);
  const deviceByImei = useMemo(() => new Map(devices.map((device) => [device.imei, device])), [devices]);

  const bind = async () => {
    try { await api.bindPlot(selected.plotCode, form); setSelected(null); setForm({ imei: '', alias: '' }); await load(); }
    catch (error) { setMessage(error.message); }
  };
  const submitBatch = async () => {
    const lines = batchText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length !== 24 || new Set(lines).size !== 24 || lines.some((imei) => !/^\d{15}$/.test(imei))) {
      setMessage('批量绑定必须是24行互不重复的15位IMEI'); return;
    }
    try { for (let index = 0; index < 24; index += 1) await api.bindPlot(`P${String(index + 1).padStart(2, '0')}`, { imei: lines[index] }); setBatchOpen(false); setBatchText(''); await load(); }
    catch (error) { setMessage(error.message); }
  };

  return (
    <main className="app-shell subpage">
      <TopToolbar />
      <section className="page-heading"><div><span>设备管理</span><h1>24个小区与D100L-Ym2绑定</h1><p>IMEI完整显示；更换设备不会改写已有历史数据。</p></div><button className="primary-button" onClick={() => setBatchOpen(true)}><ClipboardText />批量粘贴IMEI</button></section>
      {message ? <div className="error-banner">{message}<button onClick={() => setMessage('')}>关闭</button></div> : null}
      <section className="data-card"><div className="table-scroll"><table className="device-table"><thead><tr><th>P编号</th><th>试验编号</th><th>模式</th><th>IMEI / 别名</th><th>最近上报</th><th>结果</th><th>电池</th><th>CSQ</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {plots.map((plot) => { const device = deviceByImei.get(plot.imei); return <tr key={plot.plotCode}><td><b>{plot.plotCode}</b></td><td>{plot.experimentCode}</td><td>{plot.sensorMode === 'water_soil' ? '水位＋四参' : '张力＋四参'}</td><td>{plot.imei ? <><b className="mono">{plot.imei}</b><small>{plot.deviceAlias || '未命名'}</small></> : <span className="muted">未绑定</span>}</td><td>{localTime(plot.lastIngestAt, true)}</td><td>{plot.lastIngestResult || '—'}</td><td>{batteryV(plot.metrics?.batteryMv)}</td><td>{value(plot.metrics?.csq, 0)}</td><td><StatusBadge status={plot.status} /></td><td><div className="row-actions"><button onClick={() => { setSelected(plot); setForm({ imei: plot.imei || '', alias: plot.deviceAlias || '' }); }}><LinkSimple />{plot.imei ? '更换' : '绑定'}</button>{plot.imei ? <button onClick={async () => { await api.unbindPlot(plot.plotCode); await load(); }}><LinkBreak />解绑</button> : null}{device ? <><button onClick={async () => setLog(await api.lastIngest(device.id))}><Eye />原始上报</button><button onClick={async () => { await api.updateDevice(device.id, { enabled: !device.enabled }); await load(); }}>{device.enabled ? <ToggleRight /> : <ToggleLeft />}{device.enabled ? '停用' : '启用'}</button></> : null}</div></td></tr>; })}
      </tbody></table></div></section>
      <Modal open={Boolean(selected)} title={`${selected?.plotCode || ''} 绑定IMEI`} onClose={() => setSelected(null)} actions={<><button className="ghost-button" onClick={() => setSelected(null)}>取消</button><button className="primary-button" onClick={bind}>确认绑定</button></>}><label>IMEI<input value={form.imei} maxLength="15" onChange={(event) => setForm({ ...form, imei: event.target.value.trim() })} placeholder="15位IMEI" /></label><label>设备别名<input value={form.alias} onChange={(event) => setForm({ ...form, alias: event.target.value })} placeholder="例如 P01 采集终端" /></label></Modal>
      <Modal open={batchOpen} title="按P01–P24顺序批量绑定" onClose={() => setBatchOpen(false)} actions={<><button className="ghost-button" onClick={() => setBatchOpen(false)}>取消</button><button className="primary-button" onClick={submitBatch}>校验并绑定</button></>}><p className="field-note">粘贴24行IMEI，系统将检查行数、格式和重复值。</p><textarea rows="14" value={batchText} onChange={(event) => setBatchText(event.target.value)} placeholder={'862323089930701\n862323089930702\n…'} /></Modal>
      <Modal open={log !== null} title="最后一次原始上报" onClose={() => setLog(null)}><pre className="json-view">{JSON.stringify(log, null, 2)}</pre></Modal>
    </main>
  );
}
