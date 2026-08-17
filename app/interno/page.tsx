'use client'

import { FinanceBoard } from '@/components/finance-board'
import { INTERNAL_RATES } from '@/lib/finance/hotel-cost'
import { logout } from './login/actions'
import { importPaymentsXlsx } from './actions'

export default function InternoPage() {
  return (
    <FinanceBoard
      scope="interno"
      rates={INTERNAL_RATES}
      title="Interno"
      loginPath="/interno/login"
      logout={logout}
      importPaymentsXlsx={importPaymentsXlsx}
      showTotalOutstanding
    />
  )
}
