import type { Point } from "@tscircuit/math-utils"
import type {
  CrossSection as CrossSectionType,
  FillRule,
  SimplePolygon,
} from "manifold-3d"

const manifoldModule = await import("manifold-3d")
const manifoldFactory = manifoldModule.default as unknown as () => Promise<{
  CrossSection: typeof CrossSectionType
  setup: () => void
}>
const manifold = await manifoldFactory()
manifold.setup()

const { CrossSection } = manifold

export const MANIFOLD_GEOMETRY_SCALE = 1_000_000
export const DEFAULT_MIN_ISLAND_AREA = 1e-8

export type PolygonRing = Point[]
type ScaledPolygons = SimplePolygon[]
export type CopperPourIsland = {
  outerRing: PolygonRing
  innerRings: PolygonRing[]
}

const describePolygons = (polygons: ScaledPolygons) => {
  let pointCount = 0
  const bbox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }

  for (const polygon of polygons) {
    pointCount += polygon.length
    for (const [x, y] of polygon) {
      bbox.minX = Math.min(bbox.minX, x)
      bbox.minY = Math.min(bbox.minY, y)
      bbox.maxX = Math.max(bbox.maxX, x)
      bbox.maxY = Math.max(bbox.maxY, y)
    }
  }

  return {
    polygonCount: polygons.length,
    pointCount,
    bbox: pointCount > 0 ? bbox : null,
    scale: MANIFOLD_GEOMETRY_SCALE,
  }
}

const assertFinitePoint = (point: Point, operation: string) => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(
      `${operation} received non-finite point (${point.x}, ${point.y})`,
    )
  }
}

const pointsEqual = (a: Point, b: Point) => a.x === b.x && a.y === b.y

const signedArea = (ring: PolygonRing) => {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i]!
    const next = ring[(i + 1) % ring.length]!
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

export const normalizeRing = (
  ring: PolygonRing,
  operation = "normalizeRing",
): PolygonRing => {
  const normalized: PolygonRing = []

  for (const point of ring) {
    assertFinitePoint(point, operation)
    const roundedPoint = {
      x:
        Math.round(point.x * MANIFOLD_GEOMETRY_SCALE) / MANIFOLD_GEOMETRY_SCALE,
      y:
        Math.round(point.y * MANIFOLD_GEOMETRY_SCALE) / MANIFOLD_GEOMETRY_SCALE,
    }
    const previous = normalized[normalized.length - 1]
    if (!previous || !pointsEqual(previous, roundedPoint)) {
      normalized.push(roundedPoint)
    }
  }

  if (
    normalized.length > 1 &&
    pointsEqual(normalized[0]!, normalized[normalized.length - 1]!)
  ) {
    normalized.pop()
  }

  const uniquePoints = new Set(normalized.map((p) => `${p.x},${p.y}`))
  if (uniquePoints.size < 3 || Math.abs(signedArea(normalized)) < 1e-18) {
    return []
  }

  return normalized
}

// Manifold owns all robust 2D clipping/offsetting for copper-pour geometry.
// This adapter keeps scaling, ring normalization, errors, and output grouping
// out of the solver so the rest of the repo stays independent of WASM details.
export const toScaledManifoldPolygons = (
  polygons: PolygonRing[],
  operation = "toScaledManifoldPolygons",
): ScaledPolygons => {
  const scaledPolygons: ScaledPolygons = []

  for (const polygon of polygons) {
    const normalized = normalizeRing(polygon, operation)
    if (normalized.length < 3) continue
    const positiveRing =
      signedArea(normalized) < 0 ? [...normalized].reverse() : normalized
    scaledPolygons.push(
      positiveRing.map((p) => [
        Math.round(p.x * MANIFOLD_GEOMETRY_SCALE),
        Math.round(p.y * MANIFOLD_GEOMETRY_SCALE),
      ]),
    )
  }

  return scaledPolygons
}

export const fromScaledManifoldPolygons = (
  polygons: SimplePolygon[],
): PolygonRing[] =>
  polygons
    .map((polygon) =>
      normalizeRing(
        polygon.map(([x, y]) => ({
          x: x / MANIFOLD_GEOMETRY_SCALE,
          y: y / MANIFOLD_GEOMETRY_SCALE,
        })),
        "fromScaledManifoldPolygons",
      ),
    )
    .filter((polygon) => polygon.length >= 3)

const runManifoldOperation = <T>(
  operation: string,
  polygons: ScaledPolygons,
  callback: () => T,
): T => {
  try {
    return callback()
  } catch (error) {
    const details = describePolygons(polygons)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${operation} failed: ${message}; details=${JSON.stringify(details)}`,
    )
  }
}

export const crossSectionFromPolygon = (
  polygon: PolygonRing,
  fillRule: FillRule = "Positive",
): CrossSectionType => {
  const scaledPolygons = toScaledManifoldPolygons(
    [polygon],
    "crossSectionFromPolygon",
  )
  if (scaledPolygons.length === 0) {
    return CrossSection.ofPolygons([])
  }
  return runManifoldOperation("crossSectionFromPolygon", scaledPolygons, () =>
    CrossSection.ofPolygons(scaledPolygons, fillRule),
  )
}

export const crossSectionFromPolygons = (
  polygons: PolygonRing[],
  fillRule: FillRule = "Positive",
): CrossSectionType => {
  const scaledPolygons = toScaledManifoldPolygons(
    polygons,
    "crossSectionFromPolygons",
  )
  if (scaledPolygons.length === 0) {
    return CrossSection.ofPolygons([])
  }
  return runManifoldOperation("crossSectionFromPolygons", scaledPolygons, () =>
    CrossSection.ofPolygons(scaledPolygons, fillRule),
  )
}

export const composeCrossSections = (
  sections: CrossSectionType[],
): CrossSectionType => {
  const nonEmptySections = sections.filter((section) => !section.isEmpty())
  if (nonEmptySections.length === 0) {
    return CrossSection.ofPolygons([])
  }
  return runManifoldOperation("composeCrossSections", [], () =>
    CrossSection.compose(nonEmptySections),
  )
}

export const offsetPolygon = (
  polygon: PolygonRing,
  margin: number,
  joinType: "Square" | "Round" | "Miter" = "Miter",
): PolygonRing[] => {
  const scaledPolygons = toScaledManifoldPolygons([polygon], "offsetPolygon")
  if (scaledPolygons.length === 0 || margin <= 0) {
    return scaledPolygons.length === 0 ? [] : [normalizeRing(polygon)]
  }

  const scaledMargin = margin * MANIFOLD_GEOMETRY_SCALE
  const section = runManifoldOperation(
    "offsetPolygon.input",
    scaledPolygons,
    () => CrossSection.ofPolygons(scaledPolygons, "Positive"),
  )
  const offset = runManifoldOperation(
    "offsetPolygon.offset",
    scaledPolygons,
    () => section.offset(scaledMargin, joinType, 2, 32),
  )
  return fromScaledManifoldPolygons(offset.toPolygons())
}

export const subtractBlockersFromPour = (
  pourPolygon: PolygonRing,
  blockerPolygons: PolygonRing[],
): CrossSectionType => {
  const pourSection = crossSectionFromPolygon(pourPolygon)
  const blockerSection = crossSectionFromPolygons(blockerPolygons)

  if (pourSection.isEmpty() || blockerSection.isEmpty()) {
    return pourSection
  }

  const operationPolygons = [
    ...toScaledManifoldPolygons([pourPolygon], "subtractBlockersFromPour.pour"),
    ...toScaledManifoldPolygons(
      blockerPolygons,
      "subtractBlockersFromPour.blockers",
    ),
  ]

  return runManifoldOperation(
    "subtractBlockersFromPour",
    operationPolygons,
    () => pourSection.subtract(blockerSection),
  )
}

export const removeTinyIslands = (
  section: CrossSectionType,
  minArea = DEFAULT_MIN_ISLAND_AREA,
): CrossSectionType => {
  if (section.isEmpty()) return section

  const minScaledArea =
    minArea * MANIFOLD_GEOMETRY_SCALE * MANIFOLD_GEOMETRY_SCALE
  const islands = section
    .decompose()
    .filter((island) => Math.abs(island.area()) >= minScaledArea)

  return composeCrossSections(islands)
}

export const crossSectionToCopperPourIslands = (
  section: CrossSectionType,
): CopperPourIsland[] => {
  const islands: CopperPourIsland[] = []

  for (const island of section.decompose()) {
    const rings = fromScaledManifoldPolygons(island.toPolygons())
    if (rings.length === 0) continue

    const outerRing = rings.reduce((largest, ring) =>
      Math.abs(signedArea(ring)) > Math.abs(signedArea(largest))
        ? ring
        : largest,
    )
    const innerRings = rings.filter((ring) => ring !== outerRing)

    islands.push({
      outerRing,
      innerRings,
    })
  }

  return islands
}

export const geometryDebugSummary = (
  label: string,
  polygons: PolygonRing[],
) => ({
  label,
  ...describePolygons(toScaledManifoldPolygons(polygons, label)),
})
