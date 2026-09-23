// Closed figures for /finance. The board normally derives both numbers from
// the data it holds -- revenue from the imported ticketing lines, hotel cost
// from the bookings priced at RATES -- and both fall short of what actually
// happened: the ticketing export misses sales taken outside it, and the
// hotel's final invoice carries nights, extras and rate changes the bookings
// never knew about. Rather than paper over the gap with manual entries, which
// would leave the real totals buried in a list of adjustments, /finance is
// told the closed totals outright.
//
// /interno keeps computing its own, on its own rates. That is the whole point
// of the second page, so nothing here is shared with it.

export interface FinanceActuals {
  /** What the hotel finally invoiced, all four reservations together. */
  readonly hotelCost: number
  /** Total revenue for the edition, ticketing and everything else. */
  readonly revenue: number
}

export const FINANCE_ACTUALS: FinanceActuals = {
  hotelCost: 134800,
  revenue: 205825,
}
