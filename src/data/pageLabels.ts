// Menu labels by page id, taken from the menu list in src/data/menu.ts.
import { MENU_PAGES } from './menu';
export const WORKFLOW_LABELS: Record<string, string> = Object.fromEntries(MENU_PAGES.map((p) => [p.id, p.label]));
