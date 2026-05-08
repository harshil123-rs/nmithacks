import { describe, it, expect } from 'vitest';
import { computeGini, percentile } from '../services/healthScore.service';

describe('computeGini', () => {
  it('returns 0 for empty array',                () => expect(computeGini([])).toBe(0));
  it('returns 0 for single value',               () => expect(computeGini([0.5])).toBeCloseTo(0, 5));
  it('returns 0 for perfectly equal values',     () => expect(computeGini([1,1,1,1])).toBeCloseTo(0, 5));
  it('returns >0.9 for one dominant value', () => {
    const data = Array(20).fill(0.0001).concat([100]);
    expect(computeGini(data)).toBeGreaterThan(0.9);
  });
  it('returns 0–1 for realistic skewed data', () => {
    const g = computeGini([0.01, 0.05, 0.08, 0.12, 0.20, 0.35, 0.60, 1.20]);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });
  it('returns 0 when all values are 0',          () => expect(computeGini([0,0,0])).toBe(0));
});

describe('percentile', () => {
  it('returns 0 for empty array',                    () => expect(percentile([], 90)).toBe(0));
  it('returns max at p100',                          () => expect(percentile([1,2,3,4,5], 100)).toBe(5));
  it('returns correct p90 for 10-element array', () => expect(percentile([1,2,3,4,5,6,7,8,9,10], 90)).toBe(9));
});
