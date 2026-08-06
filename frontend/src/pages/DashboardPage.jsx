import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gauge, Drop, ThermometerHot, Lightning, Flask, Waves } from '@phosphor-icons/react';
import { api } from '../api/client.js';
import { TopToolbar } from '../components/TopToolbar.jsx';
import { SummaryMetricCard } from '../components/SummaryMetricCard.jsx';
import { PlotMatrix } from '../components/PlotMatrix.jsx';
import { HistoryPanel } from '../components/HistoryPanel.jsx';
import { LatestReadingsTable } from '../components/LatestReadingsTable.jsx';
import { localTime } from '../utils/format.js';

export function DashboardPage() {
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [selectedPlotCode, setSelectedPlotCode] = useState('P01');
  const [range, setRange] = useState('1h');
  const [history, setHistory] = useState([]);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      const [nextOverview, nextTrends] = await Promise.all([api.overview(), api.summaryTrends('24h')]);
      setOverview(nextOverview);
      setTrends(nextTrends.points || []);
      setError('');
    } catch (requestError) { setError(requestError.message); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    const seconds = overview?.settings?.dashboard?.refreshSeconds || 10;
    const timer = window.setInterval(loadOverview, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [loadOverview, overview?.settings?.dashboard?.refreshSeconds]);

  useEffect(() => {
    if (!selectedPlotCode) return;
    Promise.all([api.plotHistory(selectedPlotCode, range), api.plotRecent(selectedPlotCode, 10)])
      .then(([historyData, recentData]) => { setHistory(historyData.points || []); setRecent(recentData.rows || []); })
      .catch((requestError) => setError(requestError.message));
  }, [selectedPlotCode, range, overview?.generatedAt]);

  const selectedPlot = useMemo(() => overview?.plots?.find((plot) => plot.plotCode === selectedPlotCode) || overview?.plots?.[0], [overview, selectedPlotCode]);
  const summaryCards = overview ? [
    { icon: Waves, title: 'W0 水位', unit: '(cm)', summary: overview.summary.waterLevel, dataKey: 'waterLevelMm', color: '#0aaa72', transform: (value) => value / 10 },
    { icon: Gauge, title: 'W1/W2 土壤张力', unit: '(kPa)', summary: overview.summary.soilTension, dataKey: 'soilTensionKpa', color: '#0e9f6e' },
    { icon: Drop, title: '土壤含水率', unit: '(%)', summary: overview.summary.soilMoisture, dataKey: 'soilMoisturePercent', color: '#1769ff' },
    { icon: ThermometerHot, title: '土壤温度', unit: '(℃)', summary: overview.summary.soilTemperature, dataKey: 'soilTemperatureC', color: '#ff6814' },
    { icon: Lightning, title: '土壤EC', unit: '(mS/cm)', summary: overview.summary.soilEc, dataKey: 'soilEcUsCm', color: '#8c43e9', transform: (value) => value / 1000, digits: 2 },
    { icon: Flask, title: '土壤pH', unit: '', summary: overview.summary.soilPh, dataKey: 'soilPh', color: '#0aaa72', digits: 2 }
  ] : [];

  return (
    <main className="app-shell dashboard-page">
      <TopToolbar counts={overview?.counts} generatedAt={localTime(overview?.generatedAt, true)} refreshSeconds={overview?.settings?.dashboard?.refreshSeconds || 10} onExport={() => { window.location.href = '/api/exports/readings.csv'; }} />
      {error ? <div className="error-banner">{error}<button onClick={loadOverview}>重试</button></div> : null}
      {!overview ? <div className="page-loading">正在读取水稻试验实时数据…</div> : (
        <>
          <section className="summary-grid">{summaryCards.map((card) => <SummaryMetricCard key={card.title} {...card} points={trends} />)}</section>
          <section className="matrix-panel">
            <PlotMatrix plots={overview.plots} selectedPlotCode={selectedPlot?.plotCode} onSelect={setSelectedPlotCode} />
          </section>
          <HistoryPanel plot={selectedPlot} points={history} range={range} onRange={setRange} />
          <LatestReadingsTable plot={selectedPlot} rows={recent} />
        </>
      )}
    </main>
  );
}
