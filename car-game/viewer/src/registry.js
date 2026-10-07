import { buildStarterCoupe } from './models/cars/starterCoupe.js';
import { buildCautionPlow } from './models/parts/cautionPlow.js';
import { buildBrowningM2 } from './models/parts/browningM2.js';
import { buildSpikedWheel } from './models/parts/spikedWheel.js';

// Everything the viewer can show. Add new cars/parts here.
export const MODELS = [
  { id: 'starter_coupe', name: 'Starter Coupe', category: 'Cars', build: buildStarterCoupe },
  { id: 'part_caution_plow', name: 'Caution Dozer', category: 'Parts', build: buildCautionPlow },
  { id: 'part_browning_m2', name: 'Browning M2', category: 'Parts', build: buildBrowningM2 },
  { id: 'part_spiked_wheel', name: 'Spiked Wheel', category: 'Parts', build: () => buildSpikedWheel(1) },
];
