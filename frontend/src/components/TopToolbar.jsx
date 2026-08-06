import { Link, useLocation } from 'react-router-dom';
import { GearSix, DownloadSimple, Cpu, Plant, ClockCounterClockwise } from '@phosphor-icons/react';

export function TopToolbar({ counts, generatedAt, refreshSeconds = 10, onExport }) {
  const location = useLocation();
  const active = (path) => location.pathname === path ? 'is-active' : '';
  return (
    <header className="top-toolbar">
      <div className="toolbar-left">
        <Link className="brand-mark" to="/" aria-label="返回实时监测"><Plant weight="duotone" /></Link>
        <Link className={`toolbar-button ${active('/settings')}`} to="/settings"><GearSix weight="bold" />系统设置</Link>
        <Link className={`toolbar-button ${active('/exports')}`} to="/exports"><DownloadSimple weight="bold" />数据导出</Link>
        <Link className={`toolbar-button ${active('/devices')}`} to="/devices"><Cpu weight="bold" />设备管理</Link>
      </div>
      {counts ? (
        <div className="toolbar-right">
          <span className="toolbar-stat online"><i />在线小区 <b>{counts.online}/{counts.total}</b></span>
          <span className="toolbar-stat abnormal"><i />异常 <b>{counts.abnormal}</b></span>
          <span className="toolbar-stat missing"><i />缺测 <b>{counts.missing}</b></span>
          <span className="last-update">最后更新 <b>{generatedAt || '—'}</b></span>
          <span className="auto-refresh"><ClockCounterClockwise />自动刷新 <b>{refreshSeconds}秒</b></span>
          <button className="primary-button" onClick={onExport}><DownloadSimple weight="bold" />导出全部CSV</button>
        </div>
      ) : <Link className="back-dashboard" to="/">返回实时监测</Link>}
    </header>
  );
}
