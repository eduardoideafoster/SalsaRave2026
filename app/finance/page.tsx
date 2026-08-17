'use client'

import { FinanceBoard } from '@/components/finance-board'
import { RATES } from '@/lib/finance/hotel-cost'
import { logout } from './login/actions'
import { importPaymentsXlsx } from './actions'

export default function FinancePage() {
  return (
    <FinanceBoard
      scope="finance"
      rates={RATES}
      title="Finance"
      loginPath="/finance/login"
      logout={logout}
      importPaymentsXlsx={importPaymentsXlsx}
    />
  )
}
