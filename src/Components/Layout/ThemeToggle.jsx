import { Moon, Sun } from 'lucide-react'

import IconAction from '@/Components/Layout/IconAction'
import { useTheme } from '@/Hooks/useTheme'

/**
 * The header's light / dark switch. Shows the theme it will switch TO:
 * a moon in light mode, a sun in dark mode.
 */
export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return <IconAction label={label} icon={isDark ? Sun : Moon} onClick={toggleTheme} />
}
