import type { InputPad } from "lib/types"
import {
  composeCrossSections,
  crossSectionFromPolygons,
  intersectCrossSections,
  offsetCrossSection,
  removeTinyIslands,
} from "./manifold-geometry-adapter"
import type { CrossSection } from "./manifold-runtime"
import { processObstaclesForPour } from "./process-obstacles"

const SAME_NET_TOUCH_TOLERANCE_MM = 1e-5

/**
 * Removes copper pour islands that do not connect to any same-net copper on
 * the layer (matching KiCad `island_removal_mode 0`), while preserving
 * connectivity across adjacent same-net pour regions.
 */
export const removeUnconnectedIslands = ({
  pourSections,
  sameNetPads,
  enforceConnectivity,
}: {
  pourSections: CrossSection[]
  sameNetPads: InputPad[]
  enforceConnectivity: boolean
}): CrossSection[] => {
  if (!enforceConnectivity || pourSections.length === 0) {
    return pourSections
  }

  if (sameNetPads.length === 0) {
    return pourSections.map(() => composeCrossSections([]))
  }

  const { polygonsToSubtract: sameNetPolygons } = processObstaclesForPour(
    sameNetPads,
    undefined,
    { padMargin: 0, traceMargin: 0 },
  )
  const sameNetCopper = offsetCrossSection(
    crossSectionFromPolygons(sameNetPolygons),
    SAME_NET_TOUCH_TOLERANCE_MM,
    "Round",
  )
  if (sameNetCopper.isEmpty()) {
    return pourSections.map(() => composeCrossSections([]))
  }

  const bridgedUnion = offsetCrossSection(
    composeCrossSections(pourSections),
    SAME_NET_TOUCH_TOLERANCE_MM,
    "Round",
  )
  const connectedIslands = bridgedUnion
    .decompose()
    .filter(
      (island) => !intersectCrossSections(island, sameNetCopper).isEmpty(),
    )

  if (connectedIslands.length === 0) {
    return pourSections.map(() => composeCrossSections([]))
  }

  const connectedMask = composeCrossSections(connectedIslands)
  return pourSections.map((section) =>
    section.isEmpty()
      ? section
      : removeTinyIslands(intersectCrossSections(section, connectedMask)),
  )
}
