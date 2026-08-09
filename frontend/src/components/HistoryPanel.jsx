import { EChart } from './EChart.jsx';
import { localTime } from '../utils/format.js';

const COLORS = { primary: '#0aaa72', moisture: '#1677ff', temperature: '#ff6b14', ec: '#8c43e9', ph: '#12a66a' };

function chartOption(points, series, yAxes = [{ type: 'value', scale: true }]) {
  return {
    animationDuration: 220,
    grid: { left: 44, right: yAxes.length > 1 ? 44 : 18, top: 18, bottom: 30 },
    tooltip: {
      trigger: 'axis',
      formatter: (items) => {
        const point = points[items[0]?.dataIndex];
        return `<b>${localTime(point?.collectedAt, true)}</b><br/>${items.map((item) => `${item.marker}${item.seriesName}：${item.value ?? '缺测'}`).join('<br/>')}`;
      }
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    xAxis: { type: 'category', boundaryGap: false, data: points.map((point) => localTime(point.collectedAt)), axisLabel: { color: '#71809a', fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: '#dfe6f0' } } },
    yAxis: yAxes.map((axis, index) => ({ ...axis, position: index ? 'right' : 'left', axisLabel: { color: '#71809a', fontSize: 10 }, splitLine: { lineStyle: { color: '#edf1f6', type: 'dashed' } } })),
    series: series.map((item, index) => ({
      name: item.name, type: 'line', yAxisIndex: item.yAxisIndex || 0,
      data: points.map((point) => item.transform ? item.transform(point[item.key]) : point[item.key]),
      connectNulls: false, showSymbol: true, symbolSize: 4, smooth: false,
      lineStyle: { width: 2, color: item.color }, itemStyle: { color: item.color },
      emphasis: { focus: 'series' }, z: 3 + index
    }))
  };
}

function ChartCard({ title, unit, option, empty }) {
  return <article className="history-chart-card"><header><strong>{title}</strong><small>{unit}</small></header>{empty ? <div className="history-empty">当前范围暂无数据</div> : <EChart option={option} className="history-chart" />}</article>;
}

export function HistoryPanel({ plot, points, range, onRange }) {
  const empty = !points.length;
  const soilOnly = plot?.sensorMode === 'soil_only';
  const primary = plot?.sensorMode === 'water_soil'
    ? { name: '水位', key: 'waterLevelMm', color: COLORS.primary, transform: (v) => v === null ? null : Number((v / 10).toFixed(1)) }
    : { name: '张力', key: 'soilTensionKpa', color: COLORS.primary };
  return (
    <section className="history-panel">
      <div className="history-toolbar">
        <strong>当前选中：<b>{plot?.plotCode || '—'}</b> <span>{plot?.experimentCode || ''}</span></strong>
        <div className="range-tabs">{[['1h', '最近1小时'], ['6h', '6小时'], ['24h', '24小时'], ['7d', '7天'], ['all', '全部']].map(([key, label]) => <button key={key} className={range === key ? 'is-active' : ''} onClick={() => onRange(key)}>{label}</button>)}</div>
        <span className="refresh-hint">缺测点自动断线</span>
      </div>
      <div className="history-grid">
        {soilOnly
          ? <ChartCard title="土壤含水率" unit="%" empty={empty} option={chartOption(points, [{ name: '含水率', key: 'soilMoisturePercent', color: COLORS.moisture }])} />
          : <ChartCard title={`${primary.name}与含水率`} unit={plot?.sensorMode === 'water_soil' ? 'cm / %' : 'kPa / %'} empty={empty} option={chartOption(points, [primary, { name: '含水率', key: 'soilMoisturePercent', color: COLORS.moisture, yAxisIndex: 1 }], [{ type: 'value', scale: true }, { type: 'value', scale: true }])} />}
        <ChartCard title="土壤温度" unit="℃" empty={empty} option={chartOption(points, [{ name: '温度', key: 'soilTemperatureC', color: COLORS.temperature }])} />
        <ChartCard title="土壤EC" unit="mS/cm" empty={empty} option={chartOption(points, [{ name: 'EC', key: 'soilEcUsCm', color: COLORS.ec, transform: (v) => v === null ? null : Number((v / 1000).toFixed(3)) }])} />
        <ChartCard title="土壤pH" unit="" empty={empty} option={chartOption(points, [{ name: 'pH', key: 'soilPh', color: COLORS.ph }])} />
      </div>
    </section>
  );
}
