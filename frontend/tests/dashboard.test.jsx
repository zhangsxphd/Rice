import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlotMatrix } from '../src/components/PlotMatrix.jsx';
import { HistoryPanel } from '../src/components/HistoryPanel.jsx';
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
      blockCode: `B${blockIndex + 1}`, waterTreatment, varietyCode, sensorMode,
      status: statuses[index % statuses.length], lastIngestAt: null,
      metrics: { waterLevelMm: sensorMode === 'water_soil' ? 30 : null, soilTensionKpa: sensorMode === 'tension_soil' ? -20 : null, soilMoisturePercent: 35, soilTemperatureC: 26, soilEcUsCm: 800, soilPh: 6.5 }
    };
  })).flat();
}

describe('实时监测页面组件', () => {
  it('按4×6映射显示24个正式小区', () => {
    render(<PlotMatrix plots={plots()} selectedPlotCode="P01" onSelect={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(24);
    expect(screen.getByText('B1-W0-V1')).toBeInTheDocument();
    expect(screen.getByText('B4-W2-V2')).toBeInTheDocument();
    expect(screen.getByText('P24')).toBeInTheDocument();
  });

  it('W0显示水位，W1/W2显示张力且状态样式不同', () => {
    render(<PlotMatrix plots={plots()} selectedPlotCode="P01" onSelect={() => {}} />);
    const p01 = screen.getByText('P01').closest('button');
    const p03 = screen.getByText('P03').closest('button');
    expect(p01).toHaveTextContent('水位');
    expect(p01).not.toHaveTextContent('张力');
    expect(p03).toHaveTextContent('张力');
    expect(document.querySelector('.state-missing')).toBeInTheDocument();
    expect(document.querySelector('.state-offline')).toBeInTheDocument();
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
});
