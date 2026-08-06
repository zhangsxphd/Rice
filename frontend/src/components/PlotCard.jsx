import { StatusBadge } from './StatusBadge.jsx';
import { ecMs, relativeTime, value, waterCm } from '../utils/format.js';

export function PlotCard({ plot, selected, activeMetric, onSelect }) {
  const metrics = plot.metrics || {};
  const primaryLabel = plot.sensorMode === 'water_soil' ? '水位' : '张力';
  const primaryValue = plot.sensorMode === 'water_soil' ? waterCm(metrics.waterLevelMm) : value(metrics.soilTensionKpa, 1, ' kPa');
  const rows = [
    [primaryLabel, primaryValue, '水分', value(metrics.soilMoisturePercent, 1, '%')],
    ['温度', value(metrics.soilTemperatureC, 1, '℃'), 'EC', value(ecMs(metrics.soilEcUsCm), 2)],
    ['pH', value(metrics.soilPh, 2), '更新', relativeTime(plot.lastIngestAt)]
  ];
  return (
    <button
      type="button"
      className={`plot-card state-${plot.status} ${selected ? 'is-selected' : ''} metric-${activeMetric}`}
      onClick={() => onSelect(plot.plotCode)}
      aria-pressed={selected}
    >
      <div className="plot-card-head"><span><b>{plot.plotCode}</b><small>{plot.experimentCode}</small></span><StatusBadge status={plot.status} /></div>
      <div className="plot-values">
        {rows.map((row, index) => <div key={index}><span>{row[0]}</span><b>{row[1]}</b><span>{row[2]}</span><b>{row[3]}</b></div>)}
      </div>
    </button>
  );
}
