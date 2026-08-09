import { StatusBadge } from './StatusBadge.jsx';
import { ecMs, relativeTime, value, waterCm } from '../utils/format.js';

const FIELD_MARKERS = {
  'B1-W2-V2': '1上：W2-V2',
  'B1-W2-V1': '1下：W2-V1',
  'B1-W0-V1': '2上：W0-V1',
  'B1-W0-V2': '2下：W0-V2',
  'B1-W1-V2': '3上：W1-V2',
  'B1-W1-V1': '3下：W1-V1',
  'B2-W0-V1': '4上：W0-V1',
  'B2-W0-V2': '4下：W0-V2',
  'B2-W1-V2': '5上：W1-V2',
  'B2-W1-V1': '5下：W1-V1',
  'B2-W2-V1': '6上：W2-V1',
  'B2-W2-V2': '6下：W2-V2',
  'B3-W1-V2': '7上：W1-V2',
  'B3-W1-V1': '7下：W1-V1',
  'B3-W2-V2': '8上：W2-V2',
  'B3-W2-V1': '8下：W2-V1',
  'B3-W0-V1': '9上：W0-V1',
  'B3-W0-V2': '9下：W0-V2',
  'B4-W2-V1': '10上：W2-V1',
  'B4-W2-V2': '10下：W2-V2',
  'B4-W0-V2': '11上：W0-V2',
  'B4-W0-V1': '11下：W0-V1',
  'B4-W1-V1': '12上：W1-V1',
  'B4-W1-V2': '12下：W1-V2'
};

export function PlotCard({ plot, selected, onSelect }) {
  const metrics = plot.metrics || {};
  const fieldMarker = FIELD_MARKERS[plot.experimentCode] || plot.plotCode;
  const imeiSuffix = plot.imei?.slice(-4) || '----';
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
      className={`plot-card state-${plot.status} ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(plot.plotCode)}
      aria-pressed={selected}
    >
      <div className="plot-card-head">
        <b className="plot-card-marker">{fieldMarker}</b>
        <span className="plot-card-imei" aria-label={plot.imei ? `IMEI 后四位 ${imeiSuffix}` : '未绑定 IMEI'}>{imeiSuffix}</span>
        <StatusBadge status={plot.status} />
      </div>
      <div className="plot-values">
        {rows.map((row, index) => <div key={index}><span>{row[0]}</span><b>{row[1]}</b><span>{row[2]}</span><b>{row[3]}</b></div>)}
      </div>
    </button>
  );
}
