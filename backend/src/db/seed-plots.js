export const SOIL_ONLY_PLOT_CODES = new Set([
  'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08',
  'P13', 'P14', 'P19', 'P20', 'P21', 'P22', 'P24'
]);

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
    const plotCode = `P${String(displayOrder).padStart(2, '0')}`;
    return {
      plotCode,
      experimentCode: `${block}-${waterTreatment}-${varietyCode}`,
      blockCode: block,
      waterTreatment,
      varietyCode,
      sensorMode,
      sensorProfile: SOIL_ONLY_PLOT_CODES.has(plotCode) ? 'soil_only' : sensorMode,
      displayOrder
    };
  });
}).flat();

export function seedPlots(database) {
  const insert = database.prepare(`
    INSERT INTO plots (
      plot_code, experiment_code, block_code, water_treatment, variety_code,
      sensor_mode, sensor_profile, display_order, enabled, created_at, updated_at
    ) VALUES (@plotCode, @experimentCode, @blockCode, @waterTreatment, @varietyCode,
      @sensorMode, @sensorProfile, @displayOrder, 1, @time, @time)
    ON CONFLICT(plot_code) DO NOTHING
  `);
  const time = new Date().toISOString();
  database.transaction(() => {
    for (const plot of PLOT_SEED) insert.run({ ...plot, time });
  })();
}
