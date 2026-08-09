import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlotMatrix } from '../src/components/PlotMatrix.jsx';
import { HistoryPanel } from '../src/components/HistoryPanel.jsx';
import { LatestReadingsTable } from '../src/components/LatestReadingsTable.jsx';
import { TopToolbar } from '../src/components/TopToolbar.jsx';

afterEach(cleanup);

function plots() {
  const statuses = ['normal', 'abnormal', 'missing', 'offline', 'unbound'];
  return Array.from({ length: 4 }, (_, blockIndex) => [
    ['W0', 'V1', 'water_soil'], ['W0', 'V2', 'water_soil'], ['W1', 'V1', 'tension_soil'],
    ['W1', 'V2', 'tension_soil'], ['W2', 'V1', 'tension_soil'], ['W2', 'V2', 'tension_soil']
  ].map(([waterTreatment, varietyCode, sensorMode], columnIndex) => {
    const index = blockIndex * 6 + columnIndex + 1;
    return {
      plotCode: `P${String(index).padStart(2, '0')}`,
      experimentCode: `B${blockIndex + 1}-${waterTreatment}-${varietyCode}`,
      imei: `86232308993${String(700 + index).padStart(4, '0')}`,
      blockCode: `B${blockIndex + 1}`, waterTreatment, varietyCode, sensorMode,
      status: statuses[index % statuses.length], lastIngestAt: null,
      metrics: { waterLevelMm: sensorMode === 'water_soil' ? 30 : null, soilTensionKpa: sensorMode === 'tension_soil' ? -20 : null, soilMoisturePercent: 35, soilTemperatureC: 26, soilEcUsCm: 800, soilPh: 6.5 }
    };
  })).flat();
}

describe('实时监测页面组件', () => {
  it('按4×6映射显示24个正式小区和现场上下标记', () => {
    render(<PlotMatrix plots={plots()} selectedPlotCode="P01" onSelect={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(24);
    for (const marker of [
      '1上：W2-V2', '1下：W2-V1', '2上：W0-V1', '2下：W0-V2', '3上：W1-V2', '3下：W1-V1',
      '4上：W0-V1', '4下：W0-V2', '5上：W1-V2', '5下：W1-V1', '6上：W2-V1', '6下：W2-V2',
      '7上：W1-V2', '7下：W1-V1', '8上：W2-V2', '8下：W2-V1', '9上：W0-V1', '9下：W0-V2',
      '10上：W2-V1', '10下：W2-V2', '11上：W0-V2', '11下：W0-V1', '12上：W1-V1', '12下：W1-V2'
    ]) expect(screen.getByText(marker)).toBeInTheDocument();
    expect(screen.queryByText('P24')).not.toBeInTheDocument();
  });

  it('W0显示水位，W1/W2显示张力且状态样式不同', () => {
    render(<PlotMatrix plots={plots()} selectedPlotCode="P01" onSelect={() => {}} />);
    const p01 = screen.getByText('2上：W0-V1').closest('button');
    const p03 = screen.getByText('3下：W1-V1').closest('button');
    expect(p01).toHaveTextContent('水位');
    expect(p01).not.toHaveTextContent('张力');
    expect(p03).toHaveTextContent('张力');
    expect(document.querySelector('.state-missing')).toBeInTheDocument();
    expect(document.querySelector('.state-offline')).toBeInTheDocument();
  });

  it('仅土壤四参数小区不显示水位或张力', () => {
    const soilOnly = { ...plots()[0], sensorMode: 'soil_only', metrics: { waterLevelMm: null, soilTensionKpa: null, soilMoisturePercent: 35, soilTemperatureC: 26, soilEcUsCm: 800, soilPh: 6.5 } };
    render(<PlotMatrix plots={[soilOnly]} selectedPlotCode="P01" onSelect={() => {}} />);
    const card = screen.getByText('2上：W0-V1').closest('button');
    expect(card).toHaveTextContent('水分');
    expect(card).not.toHaveTextContent('水位');
    expect(card).not.toHaveTextContent('张力');
  });

  it('在卡片中间只显示IMEI后四位', () => {
    render(<PlotMatrix plots={plots()} selectedPlotCode="P01" onSelect={() => {}} />);
    const p01 = screen.getByText('2上：W0-V1').closest('button');
    expect(p01.querySelector('.plot-card-imei')).toHaveTextContent('0701');
    expect(p01).not.toHaveTextContent('862323089930701');
  });

  it('无数据时显示空态且时间范围切换回调正确', () => {
    const onRange = vi.fn();
    render(<HistoryPanel plot={plots()[0]} points={[]} range="1h" onRange={onRange} />);
    expect(screen.getAllByText('当前范围暂无数据')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: '24小时' }));
    expect(onRange).toHaveBeenCalledWith('24h');
  });

  it('顶部按钮顺序进入设置、导出、设备页面', () => {
    render(<MemoryRouter><TopToolbar /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links[1]).toHaveTextContent('系统设置');
    expect(links[1]).toHaveAttribute('href', '/settings');
    expect(links[2]).toHaveTextContent('数据导出');
    expect(links[3]).toHaveTextContent('设备管理');
  });

  it('最新数据表保留移动端横向滚动容器和提示', () => {
    render(<LatestReadingsTable plot={plots()[0]} rows={[]} />);
    expect(screen.getByText('左右滑动查看全部指标')).toBeInTheDocument();
    expect(document.querySelector('.table-scroll')).toContainElement(document.querySelector('.latest-readings-table'));
    expect(document.querySelector('.latest-readings-table')).toHaveTextContent('水位 (cm)');
  });

  it('仅土壤四参数最新表不保留空的主指标列', () => {
    const soilOnly = { ...plots()[0], sensorMode: 'soil_only' };
    render(<LatestReadingsTable plot={soilOnly} rows={[]} />);
    expect(document.querySelector('.latest-readings-table')).toHaveTextContent('含水率 (%)');
    expect(document.querySelector('.latest-readings-table')).not.toHaveTextContent('水位 (cm)');
    expect(document.querySelector('.latest-readings-table')).not.toHaveTextContent('张力 (kPa)');
  });
});
