'use client'

import { useMemo, useRef, useState } from 'react'
import {
  SMALL_COUNTRY_AREA,
  TINY_COUNTRY_AREA,
  WORLD_MAP_ASPECT,
  WORLD_MAP_COUNTRIES,
  WORLD_MAP_LAND,
  WORLD_MAP_VIEWBOX,
} from '@/lib/world-map'

export interface CountryPresence {
  country: string
  total: number
  leaders: number
  followers: number
}

// The app is dark-only (see app/layout.tsx), so these are literal rather than
// theme tokens: a --muted that flips to near-white in a light theme would make
// the map vanish.
const ELECTRIC = '#38bdf8' // countries with people
const ELECTRIC_BRIGHT = '#7dd3fc' // the one under the cursor
const EMPTY_LAND = '#1e3050' // everywhere we have nobody from
const FOLLOWER = '#ec4899' // pink
const LEADER = '#1e3a8a' // navy

/**
 * A world map with the countries our guests come from lit in electric blue.
 * Hovering one makes it glow and shows how many people come from there, split
 * into followers and leaders.
 *
 * Outlines live in lib/world-map.ts, keyed by the exact spelling
 * guests.country uses. Anything with no outline — a fresh spelling, or
 * Unknown — is named under the map rather than silently dropped, so the map
 * can never quietly disagree with the list beside it.
 */
export function WorldPresenceMap({ data }: { data: CountryPresence[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  // Tapping pins a country: a touch screen has no hover.
  const [pinned, setPinned] = useState<string | null>(null)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })

  const { byCountry, onMap, offMap, max } = useMemo(() => {
    const byCountry = new Map(data.map((d) => [d.country, d]))
    const onMap = data.filter((d) => WORLD_MAP_COUNTRIES[d.country])
    const offMap = data.filter((d) => !WORLD_MAP_COUNTRIES[d.country])
    const max = Math.max(1, ...onMap.map((d) => d.total))
    return { byCountry, onMap, offMap, max }
  }, [data])

  const active = hovered ?? pinned
  const activeData = active ? byCountry.get(active) : undefined
  const peopleOnMap = onMap.reduce((s, d) => s + d.total, 0)

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-lg border border-border"
        style={{ background: 'radial-gradient(120% 140% at 50% 0%, #0d2144 0%, #091c3d 70%)' }}
        onMouseMove={(e) => {
          const box = wrapRef.current?.getBoundingClientRect()
          if (box) setCursor({ x: e.clientX - box.left, y: e.clientY - box.top })
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <svg
          viewBox={WORLD_MAP_VIEWBOX}
          className="block w-full"
          style={{ aspectRatio: WORLD_MAP_ASPECT }}
          role="img"
          aria-label={`World map with the ${onMap.length} countries our guests come from highlighted`}
        >
          <path d={WORLD_MAP_LAND} fill={EMPTY_LAND} />

          {onMap.map((d) => {
            const shape = WORLD_MAP_COUNTRIES[d.country]
            const isActive = active === d.country
            // A gentle ramp: the crowded countries read heavier without the
            // quiet ones fading into the background.
            const weight = Math.sqrt(d.total / max)
            const paint = {
              fill: isActive ? ELECTRIC_BRIGHT : ELECTRIC,
              fillOpacity: isActive ? 1 : 0.45 + weight * 0.35,
              stroke: isActive ? ELECTRIC_BRIGHT : ELECTRIC,
              strokeWidth: isActive ? 1.2 : 0.35,
              strokeOpacity: isActive ? 1 : 0.7,
              style: {
                cursor: 'pointer',
                transition: 'fill-opacity 120ms ease-out, fill 120ms ease-out',
                filter: isActive
                  ? `drop-shadow(0 0 4px ${ELECTRIC}) drop-shadow(0 0 12px ${ELECTRIC})`
                  : undefined,
              } as const,
            }
            const track = {
              onMouseEnter: () => setHovered(d.country),
              onClick: () => setPinned((p) => (p === d.country ? null : d.country)),
            }
            return (
              <g key={d.country}>
                {shape.area >= TINY_COUNTRY_AREA ? (
                  <path d={shape.d} {...paint} {...track} />
                ) : (
                  // Singapore and Bahrain project to nothing at world scale.
                  // A dot is the honest way to show they are there at all.
                  <circle cx={shape.c[0]} cy={shape.c[1]} r={2.6} {...paint} {...track} />
                )}
                {shape.area < SMALL_COUNTRY_AREA && (
                  // Two or three pixels of country is not something you can
                  // point at. This invisible disc is the real hover target.
                  <circle
                    cx={shape.c[0]}
                    cy={shape.c[1]}
                    r={6}
                    fill="none"
                    // Without this an unpainted shape is not hit-tested at all,
                    // so the disc would be invisible in both senses.
                    pointerEvents="all"
                    style={{ cursor: 'pointer' }}
                    {...track}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {activeData && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm"
            style={{
              // Clamped so the card never hangs off the edge of the map.
              left: Math.min(Math.max(cursor.x, 90), (wrapRef.current?.clientWidth ?? 0) - 90),
              top: Math.max(cursor.y - 12, 4),
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="whitespace-nowrap text-sm font-semibold text-foreground">
              {activeData.country}
            </div>
            <div className="text-xs text-muted-foreground">
              {activeData.total} {activeData.total === 1 ? 'person' : 'people'}
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-foreground">
                <span className="size-3 rounded-sm ring-1 ring-white/25" style={{ backgroundColor: FOLLOWER }} />
                {activeData.followers}
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-foreground">
                <span className="size-3 rounded-sm ring-1 ring-white/40" style={{ backgroundColor: LEADER }} />
                {activeData.leaders}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm ring-1 ring-white/25" style={{ backgroundColor: FOLLOWER }} />
          Followers
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm ring-1 ring-white/40" style={{ backgroundColor: LEADER }} />
          Leaders
        </span>
        <span>
          {onMap.length} countries · {peopleOnMap} people
        </span>
        {offMap.length > 0 && (
          <span>Not on the map: {offMap.map((d) => `${d.country} (${d.total})`).join(', ')}</span>
        )}
      </div>
    </div>
  )
}
