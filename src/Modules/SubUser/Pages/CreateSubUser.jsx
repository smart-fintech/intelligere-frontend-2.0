/**
 * Create Sub User.
 *
 *   ( ) User   the sub users - list, view, and Create Sub User (SubUserList)
 *   (o) Role   the company's roles - list, create, edit, delete (RoleList)
 *
 * Role is selected on arrival: a sub user is given one of a company's roles,
 * so the roles come first.
 */

import { useState } from 'react'
import { CREATE_SUB_USER_LINK } from '@/Constants/navigation'
import RoleList from '../Components/RoleList'
import SubUserList from '../Components/SubUserList'
import ViewSwitch from '@/Components/Common/ViewSwitch'

const TABS = [
  { value: 'user', label: 'User' },
  { value: 'role', label: 'Role' },
]

export default function CreateSubUser() {
  const [tab, setTab] = useState('user')

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="space-y-1 lg:flex-1">
          <h1 className="text-xl font-semibold text-brand sm:text-2xl">
            {CREATE_SUB_USER_LINK.label}
          </h1>
          <p className="text-sm text-muted-foreground">
            Give your team their own logins, with a role, modules and permissions for each company.
          </p>
        </div>

        <ViewSwitch
          options={TABS}
          value={tab}
          onValueChange={setTab}
          label="Create a user or a role"
          idPrefix="sub-user"
          className="shrink-0"
        />

        {/* Balances the left column so ViewSwitch stays horizontally centered */}
        <div className="hidden lg:block lg:flex-1" aria-hidden="true" />
      </div>

      {tab === 'role' ? <RoleList /> : <SubUserList />}
    </div>
  )
}
