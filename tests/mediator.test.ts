import { describe, expect, it } from 'vitest';
import { mediate } from '../src/lib/mediator';

describe('mediate', () => {
  it('clears at the midpoint when intervals overlap', () => {
    expect(mediate(100, 60)).toEqual({ deal: true, price: 80 });
  });
  it('clears when bounds touch exactly', () => {
    expect(mediate(70, 70)).toEqual({ deal: true, price: 70 });
  });
  it('declares no deal when buyer max is below seller floor', () => {
    expect(mediate(50, 60)).toEqual({ deal: false });
  });
  it('rounds to pennies', () => {
    expect(mediate(100.01, 60)).toEqual({ deal: true, price: 80.01 });
  });
});
