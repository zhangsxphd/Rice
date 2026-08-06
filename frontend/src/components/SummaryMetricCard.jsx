import { EChart } from './EChart.jsx';
import { value } from '../utils/format.js';

function sparkOption(points, dataKey, color) {
  return {
    animation: false,
    grid: { left: 2, right: 2, top: 6, bottom: 3 },
    xAxis: { type: 'category', show: false, data: points.map((point) => point.time) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{ type: 'line', data: points.map((point) => point[dataKey]), connectNulls: false, showSymbol: true, symbolSize: 3, lineStyle: { color, width: 1.8 }, itemStyle: { color }, areaStyle: { color, opacity: 0.04 } }]
  };
}

export function SummaryMetricCard({ icon: Icon, title, unit, summary, points, dataKey, color, transform = (v) => v, digits = 1 }) {
  const average = summary?.average === null || summary?.average === undefined ? null : transform(summary.average);
  const min = summary?.min === null || summary?.min === undefined ? null : transform(summary.min);
  const max = summary?.max === null || summary?.max === undefined ? null : transform(summary.max);
  const transformedPoints = points.map((point) => ({ ...point, [dataKey]: point[dataKey] === null ? null : transform(point[dataKey]) }));
  return (
    <article className="summary-card" style={{ '--metric-color': color }}>
      <div className="summary-heading"><span className="metric-icon"><Icon weight="duotone" /></span><strong>{title}</strong><small>{unit}</small></div>
      <div className="summary-body">
        <div className="summary-value"><span>平均值</span><b>{value(average, digits)}</b><small>范围 {value(min, digits)} – {value(max, digits)}</small></div>
        {summary?.count ? <EChart option={sparkOption(transformedPoints, dataKey, color)} className="sparkline" /> : <div className="spark-empty">暂无数据</div>}
      </div>
    </article>
  );
}
