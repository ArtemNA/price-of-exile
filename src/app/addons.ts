import { APT_THEME, GRAPHITE_THEME } from '../../addons/apt-theme/theme';
import type { Theme } from './themes';

// Themes besides ours that the app ships with; each lives in addons/<name> (see THEMING.md).
// The "apt-default" configuration replaces this file to start with the APT theme instead of ours.
export const ADDON_THEMES: readonly Theme[] = [GRAPHITE_THEME, APT_THEME];
/** An addon theme to start with instead of ours: the APT layout in graphite and ice blue (since 0.1.21; Vaal in 0.1.20). */
export const DEFAULT_THEME_ID: string | null = GRAPHITE_THEME.id;
