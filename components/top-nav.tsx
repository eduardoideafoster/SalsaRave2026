'use client'

import { Tab } from '@/lib/types'
import { Building2, Users, BedDouble, CalendarDays, BarChart3 } from 'lucide-react'

interface TopNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'guests', label: 'GUESTS', icon: <Users className="size-4" /> },
  { id: 'rooms', label: 'ROOMS', icon: <BedDouble className="size-4" /> },
  { id: 'availability', label: 'AVAILABILITY BY DAY', icon: <CalendarDays className="size-4" /> },
  { id: 'statistics', label: 'STATISTICS', icon: <BarChart3 className="size-4" /> },
]

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center gap-8 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">SalsaRave 2026</h1>
        </div>
        
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors
                ${activeTab === tab.id 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
