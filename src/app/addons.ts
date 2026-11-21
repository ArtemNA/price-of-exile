import { APT_THEME, VAAL_THEME } from '../../addons/apt-theme/theme';
import type { Theme } from './themes';

// Themes besides ours that the app ships with; each lives in addons/<name> (see THEMING.md).
// The "apt-default" configuration replaces this file to start with the APT theme instead of ours.
export const ADDON_THEMES: readonly Theme[] = [VAAL_THEME, APT_THEME];
/** An addon theme to start with instead of ours: the APT layout in Vaal colours (since 0.1.20). */
export const DEFAULT_THEME_ID: string | null = VAAL_THEME.id;
