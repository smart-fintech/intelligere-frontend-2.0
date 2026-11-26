import { useSyncExternalStore } from 'react'

import { THEMES, getTheme, setTheme, subscribeTheme, toggleTheme } from '@/Library/theme'

/**
 * The current theme, and the functions to change it.
 *
 *   const { theme, isDark, setTheme, toggleTheme } = useTheme()
 *
 * Every component using this re-renders together when the theme changes -
 * from the header toggle, another tab, or the OS setting. No provider is
 * needed: the theme lives on <html>, see Library/theme.js.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme)

  return {
    theme,
    isDark: theme === THEMES.DARK,
    setTheme,
    toggleTheme,
  }
}
