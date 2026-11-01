import { describe, expect, it } from 'vitest';
import { matchesRequestedHouseNumber, requestedHouseNumber } from './locationService';

describe('house-number verification', () => {
  it('extracts a leading house number including suffixes and ranges', () => {
    expect(requestedHouseNumber('  12B Rizal Street, Manila')).toBe('12B');
    expect(requestedHouseNumber('14-16 Mabini Road')).toBe('14-16');
    expect(requestedHouseNumber('No. 47-A Rizal Street')).toBe('47-A');
    expect(requestedHouseNumber('# 12/3B Mabini Road')).toBe('12/3B');
    expect(requestedHouseNumber('Rizal Street, Manila')).toBe('');
  });

  it('requires the returned house number to match the requested one', () => {
    expect(matchesRequestedHouseNumber('12B Rizal Street', '12b')).toBe(true);
    expect(matchesRequestedHouseNumber('No. 47-A Rizal Street', '47-A')).toBe(true);
    expect(matchesRequestedHouseNumber('12 Rizal Street', '12A')).toBe(false);
    expect(matchesRequestedHouseNumber('12 Rizal Street', undefined)).toBe(false);
    expect(matchesRequestedHouseNumber('Rizal Street', '12')).toBe(false);
  });
});
