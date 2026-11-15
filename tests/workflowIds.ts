// Page ids in menu order (from src/data/menu.ts, so tests need not load React pages).
import { MENU_ORDER } from '../src/data/menu';
export const WORKFLOW_IDS = MENU_ORDER.map((p) => p.id);
