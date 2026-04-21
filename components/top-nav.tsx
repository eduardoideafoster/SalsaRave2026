'use client'

import { Tab } from '@/lib/types'
import { Users, BedDouble, CalendarDays, BarChart3, Globe } from 'lucide-react'
import Image from 'next/image'
import { useLang, useT } from '@/lib/i18n'

interface TopNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  const t = useT()
  const { lang, setLang } = useLang()

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'guests', label: t('nav.guests'), icon: <Users className="size-4" /> },
    { id: 'rooms', label: t('nav.rooms'), icon: <BedDouble className="size-4" /> },
    { id: 'availability', label: t('nav.availability'), icon: <CalendarDays className="size-4" /> },
    { id: 'statistics', label: t('nav.statistics'), icon: <BarChart3 className="size-4" /> },
  ]

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center gap-3 sm:gap-8 px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center justify-center size-8 sm:size-9 rounded-lg overflow-hidden">
            <Image src="/favicon.png" alt="SalsaRave 2026" width={36} height={36} priority />
          </div>
          <h1 className="hidden sm:block text-lg font-semibold tracking-tight text-foreground">SalsaRave 2026</h1>
        </div>

        <nav className="flex items-center gap-0.5 sm:gap-1 flex-1 sm:flex-none justify-around sm:justify-start">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.label}
              className={`
                flex items-center gap-2 px-2.5 sm:px-4 py-2 text-sm font-medium rounded-md
                transition-all duration-150 ease-out
                ${activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10 hover:-translate-y-px hover:shadow-sm'
                }
              `}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Language toggle — pushes right on desktop */}
        <div className="sm:ml-auto flex items-center gap-1 rounded-md border border-border bg-secondary/30 p-0.5 shrink-0">
          <Globe className="hidden sm:block size-3.5 text-muted-foreground ml-1" />
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-1.5 sm:px-2 py-1 text-xs rounded-md transition-colors ${
              lang === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={lang === 'en'}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('es')}
            className={`px-1.5 sm:px-2 py-1 text-xs rounded-md transition-colors ${
              lang === 'es' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={lang === 'es'}
          >
            ES
          </button>
        </div>
      </div>
    </header>
  )
}
