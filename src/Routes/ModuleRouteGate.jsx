import { Navigate } from 'react-router-dom'

import { ListSkeleton } from '@/Components/Common/DataList'
import { ROUTES } from '@/Constants/routes'
import useModuleVisibility from '@/Hooks/useModuleVisibility'

/**
 * The page of one product module, for a user whose user type may see it.
 *
 * A module hidden from the user's type (Hooks/useModuleVisibility) cannot be
 * opened by typing or pasting its URL either: the user is sent back to the
 * dashboard, and the page - and every request it would make - never mounts.
 * While the user type is not known yet a module some type is denied shows a
 * skeleton rather than its page.
 *
 *   <ModuleRouteGate moduleKey="Cheque Printing"><ChequePrintingPage /></ModuleRouteGate>
 */
export default function ModuleRouteGate({ moduleKey, children }) {
  const { known, isHidden } = useModuleVisibility()

  if (!isHidden(moduleKey)) return children

  if (!known) {
    return (
      <div className="p-4 sm:p-6">
        <ListSkeleton rows={6} />
      </div>
    )
  }

  return <Navigate to={ROUTES.DASHBOARD} replace />
}
