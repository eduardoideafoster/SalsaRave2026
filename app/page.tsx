'use client'

import { useState } from 'react'
import { Tab } from '@/lib/types'
import { TopNav } from '@/components/top-nav'
import { GuestsTab } from '@/components/guests-tab'
import { RoomsTab } from '@/components/rooms-tab'
import { AvailabilityTab } from '@/components/availability-tab'
import { StatisticsTab } from '@/components/statistics-tab'

export default function HotelManager() {
  const [activeTab, setActiveTab] = useState<Tab>('guests')
  const [openGuestId, setOpenGuestId] = useState<string | null>(null)

  const navigateToGuest = (id: string) => {
    setActiveTab('guests')
    setOpenGuestId(id)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-3 sm:p-6">
        {activeTab === 'guests' && (
          <GuestsTab
            openGuestId={openGuestId}
            onOpenGuestHandled={() => setOpenGuestId(null)}
            onOpenGuest={navigateToGuest}
          />
        )}
        {activeTab === 'rooms' && <RoomsTab onOpenGuest={navigateToGuest} />}
        {activeTab === 'availability' && <AvailabilityTab />}
        {activeTab === 'statistics' && <StatisticsTab />}
      </main>
    </div>
  )
}
