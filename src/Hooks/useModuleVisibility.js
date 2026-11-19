/**
 * WHICH PRODUCT MODULES DOES THIS USER SEE? - asked in one place:
 *
 *   const { known, isHidden, isNameHidden } = useModuleVisibility()
 *
 *   known          false until the profile (and so the user type) is in, or
 *                  has failed to arrive
 *   isHidden(key)  true for a module, by its key in PRODUCT_MODULES, that is
 *                  not to be shown - no card, no sidebar row, no page
 *   isNameHidden(name)  the same for a module named as a backend list writes
 *                  it (a company's or sub user's `active_modules`)
 *
 * THE RULE is the user type's, never the company's `active_modules` - see
 * HIDDEN_MODULES_BY_USER_TYPE in Services/Auth/accessService.
 *
 * While the user type is not known yet, every module that SOME user type is
 * denied is held back as well, so no one is shown a module for a moment and
 * then has it taken away (the same care as useInventoryAccess). A profile
 * that could not be loaded names no user type, so nothing is held back then.
 */

import { useCallback } from 'react'
import { useSelector } from 'react-redux'

import {
  USER_TYPE_RESTRICTED_MODULES,
  isModuleHiddenForUserType,
  isModuleNameHiddenForUserType,
  isRestrictedModuleName,
} from '@/Services/Auth/accessService'
import { selectProfile, selectProfileStatus, selectUserType } from '@/Store/Slices/profileSlice'

export default function useModuleVisibility() {
  const profile = useSelector(selectProfile)
  const profileStatus = useSelector(selectProfileStatus)
  const userType = useSelector(selectUserType)

  const known = Boolean(profile) || profileStatus === 'failed'

  const isHidden = useCallback(
    (moduleKey) =>
      known ? isModuleHiddenForUserType(userType, moduleKey) : USER_TYPE_RESTRICTED_MODULES.includes(moduleKey),
    [known, userType],
  )

  const isNameHidden = useCallback(
    (name) => (known ? isModuleNameHiddenForUserType(userType, name) : isRestrictedModuleName(name)),
    [known, userType],
  )

  return { known, isHidden, isNameHidden }
}
