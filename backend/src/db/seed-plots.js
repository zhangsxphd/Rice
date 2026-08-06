export const PLOT_SEED = Array.from({ length: 4 }, (_, blockIndex) => {
  const block = `B${blockIndex + 1}`;
  return [
    ['W0', 'V1', 'water_soil'],
    ['W0', 'V2', 'water_soil'],
    ['W1', 'V1', 'tension_soil'],
    ['W1', 'V2', 'tension_soil'],
    ['W2', 'V1', 'tension_soil'],
    ['W2', 'V2', 'tension_soil']
  ].map(([waterTreatment, varietyCode, sensorMode], columnIndex) => {
    const displayOrder = blockIndex * 6 + columnIndex + 1;
    return {
      plotCode: `P${String(displayOrder).padStart(2, '0')}`,
      experimentCode: `${block}-${waterTreatment}-${varietyCode}`,
      blockCode: block,
      waterTreatment,
      varietyCode,
      sensorMode,
      displayOrder
    };
  });
}).flat();

export function seedPlots(database) {
  const insert = database.prepare(`
    INSERT INTO plots (
      plot_code, experiment_code, block_code, water_treatment, variety_code,
      sensor_mode, display_order, enabled, created_at, updated_at
    ) VALUES (@plotCode, @experimentCode, @blockCode, @waterTreatment, @varietyCode,
      @sensorMode, @displayOrder, 1, @time, @time)
    ON CONFLICT(plot_code) DO NOTHING
  `);
  const time = new Date().toISOString();
  database.transaction(() => {
    for (const plot of PLOT_SEED) insert.run({ ...plot, time });
  })();
}
