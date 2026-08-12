import { describe, expect, it } from 'vitest';
import { batteryV, value, waterCm } from '../src/utils/format.js';

describe('measurement formatting', () => {
  it('keeps missing values missing instead of coercing them to zero', () => {
    expect(value(null)).toBe('—');
    expect(value(undefined)).toBe('—');
    expect(value('')).toBe('—');
    expect(waterCm(null)).toBe('—');
    expect(batteryV(null)).toBe('—');
  });

  it('preserves valid numeric zero readings', () => {
    expect(value(0, 1, ' kPa')).toBe('0.0 kPa');
    expect(waterCm(0)).toBe('0.0 cm');
    expect(batteryV(0)).toBe('0.00 V');
  });
});
