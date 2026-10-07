import { buildStarterCoupe } from './models/cars/starterCoupe.js';
import { buildCautionPlow } from './models/parts/cautionPlow.js';

// Everything the viewer can show. Add new cars/parts here.
export const MODELS = [
  { id: 'starter_coupe', name: 'Starter Coupe', category: 'Cars', build: buildStarterCoupe },
  { id: 'part_caution_plow', name: 'Caution Plow', category: 'Parts', build: buildCautionPlow },
];
