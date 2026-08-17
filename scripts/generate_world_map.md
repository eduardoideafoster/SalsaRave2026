# Regenerating `lib/world-map.ts`

`lib/world-map.ts` holds the country outlines the statistics map draws. It is
generated, not written, and committed so the app carries no mapping library and
fetches no basemap at runtime. You only need to redo it when the list of
countries we have guests from grows.

**A country that is not in that file cannot light up.** The map names any such
country under itself instead of dropping it, so if you see a country listed as
"Not on the map", this is the fix.

## The recipe

Work outside the repo — none of these belong in `package.json`:

```bash
mkdir -p /tmp/mapgen && cd /tmp/mapgen
npm init -y
npm i d3-geo@3 topojson-client@3 topojson-simplify@3
curl -L -o countries-50m.json https://unpkg.com/world-atlas@2.0.2/countries-50m.json
```

Then write a script that:

1. Simplifies the topology to `quantile(topo, 0.1)` of its weight. That is what
   takes the file from 850KB to 120KB. Lower and the coastlines get blocky.
2. Drops Antarctica, and crops the viewBox to the bounds of what is left.
3. Projects with `geoNaturalEarth1().fitWidth(1000, ...)`.
4. Rounds path data to one decimal (`geoPath(...).digits(1)`) — a tenth of a
   pixel in a 1000-wide box, and it halves the size.
5. For each country we have guests from, emits `d`, the projected `area`, and
   the centroid `c`.
6. Merges every other country into the single `WORLD_MAP_LAND` silhouette.

Two things that will bite:

- **Take centroids from the unsimplified topology.** Simplification flattens the
  smallest countries into shapes with no measurable middle, and `path.centroid`
  gives back `NaN`. Use `geoCentroid` on the raw feature, then project it.
- **`area` is load-bearing, not decoration.** Singapore and Bahrain project to
  zero at world scale: no shape to draw and nothing to point at. The component
  draws a dot for anything under `TINY_COUNTRY_AREA` and widens the hover target
  for anything under `SMALL_COUNTRY_AREA`. Without those two numbers the small
  countries silently vanish from an otherwise working map.

## Names

The keys must match `guests.country` **exactly** — that is how the component
looks a country up. Natural Earth disagrees with us on two, so they need
aliasing when reading the atlas:

| `guests.country` | Natural Earth |
| --- | --- |
| `United States` | `United States of America` |
| `Türkiye` | `Turkey` |

Everything else matched straight, including `South Korea`, `Czechia`, `Taiwan`,
`Venezuela` and `Puerto Rico`.
