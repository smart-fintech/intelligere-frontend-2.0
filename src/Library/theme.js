/**
 * Light / dark mode for the whole app.
 *
 * How it works: every colour in the project comes from the CSS variables in
 * Styles/CSS/index.css. `:root` holds the light values and `.dark` the dark
 * ones, so switching theme is nothing more than putting the `dark` class on
 * <html> (or taking it off). Tailwind's `dark:` variants key off the same
 * class (see `@custom-variant dark` in index.css).
 *
 * The choice is kept in localStorage under THEME_STORAGE_KEY, in plain text
 * and NOT through secureStorage, for two reasons:
 *   - the little script in index.html reads it before React (and the
 *     decryption key) has loaded, so the page is painted in the right theme
 *     from the first frame instead of flashing white;
 *   - it is not sensitive - it is only "light" or "dark".
 * secureStorage.clearAll() keeps this key, so logging out does not reset it.
 *
 * Nothing saved yet -> light (DEFAULT_THEME). The OS setting is ignored on
 * purpose: Intelligere opens in light mode until the user switches it, from
 * the header or the login page.
 *
 * Components should not import this directly - use the useTheme() hook.
 */

/** The localStorage key. index.html uses the same string - keep them equal. */
export const THEME_STORAGE_KEY = 'theme'

export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
}

const isTheme = (value) => value === THEMES.LIGHT || value === THEMES.DARK

/** The saved choice, or null when the user has never picked one. */
const readSaved = () => {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(saved) ? saved : null
  } catch {
    // Private mode / blocked storage: fall back to the OS preference.
    return null
  }
}

/** What a first-time visitor sees, whatever their OS is set to. */
export const DEFAULT_THEME = THEMES.LIGHT

/** The theme the app should be showing right now. */
export const getTheme = () => readSaved() ?? DEFAULT_THEME

/** Puts the theme on <html>. Safe to call as often as you like. */
export const applyTheme = (theme) => {
  const root = document.documentElement
  root.classList.toggle('dark', theme === THEMES.DARK)
  // Native widgets (scrollbars, date pickers, autofill) follow this.
  root.style.colorScheme = theme
}

/* ------------------------------------------------------------------ */
/* Change notifications, for useTheme()                               */
/* ------------------------------------------------------------------ */

const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

/** Saves and applies a theme, and tells every useTheme() on the page. */
export const setTheme = (theme) => {
  if (!isTheme(theme)) return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Not saved, but still applied for this visit.
  }
  applyTheme(theme)
  notify()
}

export const toggleTheme = () => setTheme(getTheme() === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK)

/**
 * Subscribes to theme changes from this tab and from other tabs (the
 * `storage` event). Returns the unsubscribe function, as
 * useSyncExternalStore expects.
 */
export const subscribeTheme = (listener) => {
  listeners.add(listener)

  const onStorage = (event) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    applyTheme(getTheme())
    listener()
  }

  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
