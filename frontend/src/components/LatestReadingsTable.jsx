import { DownloadSimple, CellSignalFull } from '@phosphor-icons/react';
import { batteryV, localTime, value } from '../utils/format.js';

export function LatestReadingsTable({ plot, rows }) {
  const isWater = plot?.sensorMode === 'water_soil';
  const soilOnly = plot?.sensorMode === 'soil_only';
  const colSpan = soilOnly ? 8 : 9;
  return (
    <section className="latest-panel">
      <div className="panel-title"><strong>{plot?.plotCode || '—'} 小区最新数据 <small>（最近10条）</small></strong>{plot ? <a className="outline-button" href={`/api/exports/plots/${plot.plotCode}.csv`}><DownloadSimple />导出当前小区CSV</a> : null}</div>
      <div className="table-scroll-hint">左右滑动查看全部指标</div>
      <div className="table-scroll">
        <table className="latest-readings-table"><thead><tr><th>时间</th>{!soilOnly ? <th>{isWater ? '水位 (cm)' : '张力 (kPa)'}</th> : null}<th>含水率 (%)</th><th>温度 (℃)</th><th>EC (μS/cm)</th><th>pH</th><th>电池 (V)</th><th>信号 (CSQ)</th><th>数据状态</th></tr></thead>
          <tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td>{localTime(row.collectedAt, true)}</td>{!soilOnly ? <td>{isWater ? value(row.waterLevelMm === null ? null : row.waterLevelMm / 10, 1) : value(row.soilTensionKpa, 1)}</td> : null}<td>{value(row.soilMoisturePercent, 1)}</td><td>{value(row.soilTemperatureC, 1)}</td><td>{value(row.soilEcUsCm, 0)}</td><td>{value(row.soilPh, 2)}</td><td>{batteryV(row.batteryMv).replace(' V', '')}</td><td><CellSignalFull weight="fill" /> {value(row.csq, 0)}</td><td><span className={`data-status data-${row.payloadStatus}`}>{row.payloadStatus}</span></td></tr>) : <tr><td colSpan={colSpan} className="empty-cell">当前小区暂无真实上报数据</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}
