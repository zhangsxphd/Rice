import { PlotCard } from './PlotCard.jsx';

const BLOCKS = ['B1', 'B2', 'B3', 'B4'];
const COLUMNS = [
  ['W0', 'V1'], ['W0', 'V2'], ['W1', 'V1'], ['W1', 'V2'], ['W2', 'V1'], ['W2', 'V2']
];

export function PlotMatrix({ plots, selectedPlotCode, onSelect }) {
  return (
    <div className="matrix-scroll">
      <div className="plot-matrix" data-testid="plot-matrix">
        <div className="matrix-corner">区组</div>
        {['W0', 'W1', 'W2'].map((water) => <div key={water} className={`water-header ${water.toLowerCase()}`}>{water}<small>{water === 'W0' ? '常规灌溉' : water === 'W1' ? '浅湿调控' : '深水控灌'}</small></div>)}
        <div className="variety-spacer" />
        {COLUMNS.map(([water, variety]) => <div key={`${water}-${variety}`} className="variety-header">{variety}</div>)}
        {BLOCKS.map((block) => (
          <div className="matrix-row" key={block}>
            <div className="block-header"><b>{block}</b><span>区组 {block.slice(1)}</span></div>
            {COLUMNS.map(([water, variety]) => {
              const plot = plots.find((item) => item.blockCode === block && item.waterTreatment === water && item.varietyCode === variety);
              return plot ? <PlotCard key={plot.plotCode} plot={plot} selected={plot.plotCode === selectedPlotCode} onSelect={onSelect} /> : <div key={`${block}-${water}-${variety}`} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
