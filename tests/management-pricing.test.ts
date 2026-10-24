import { describe,expect,it } from 'vitest';
import {pesoInputToCentavos,centavosToPesoInput} from '../src/features/management/pricing';
describe('menu management monetary input',()=>{
  it('converts peso inputs exactly to integer centavos',()=>{
    expect(pesoInputToCentavos('189')).toBe(18900);
    expect(pesoInputToCentavos('189.9')).toBe(18990);
    expect(pesoInputToCentavos('0.05')).toBe(5);
    expect(pesoInputToCentavos(' 199.99 ')).toBe(19999);
    expect(centavosToPesoInput(21995)).toBe('219.95');
  });
  it('rejects unsafe and ambiguous inputs',()=>{
    for(const value of ['-1','0.005','1,000','₱10','1e5','Infinity','NaN','abc','', '1000001','01']) {
      expect(pesoInputToCentavos(value)).toBeNull();
    }
  });
});
