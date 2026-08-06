import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

export function EChart({ option, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });
    chart.setOption(option, { notMerge: false });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    const observer = new ResizeObserver(resize);
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} className={`echart ${className}`} />;
}
