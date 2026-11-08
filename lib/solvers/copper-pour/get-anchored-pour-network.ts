import type { InputPad } from "lib/types"
import {
  composeCrossSections,
  crossSectionFromPolygons,
  DEFAULT_MIN_ISLAND_AREA,
} from "./manifold-geometry-adapter"
import type { CrossSection } from "./manifold-runtime"
import { MANIFOLD_GEOMETRY_SCALE } from "./polygon-ring"
import { processObstaclesForPour } from "./process-obstacles"

/** Retain physical copper connected to same-net pads, vias or traces on this layer. */
export const getAnchoredPourNetwork = (
  pours: CrossSection[],
  pads: InputPad[],
): CrossSection => {
  const { polygonsToSubtract } = processObstaclesForPour(pads, undefined, {
    padMargin: 0,
    traceMargin: 0,
    cutoutMargin: 0,
  })
  const anchors = crossSectionFromPolygons(polygonsToSubtract)
  // Union first: overlapping same-net regions and traces can join islands that
  // have no direct pad contact of their own.
  let network = crossSectionFromPolygons([])
  for (const section of [anchors, ...pours]) {
    const joined = network.add(section)
    network.delete()
    network = joined
  }
  const islands = network.decompose()
  const minContactArea = DEFAULT_MIN_ISLAND_AREA * MANIFOLD_GEOMETRY_SCALE ** 2
  const connected = islands.filter((island) => {
    const contact = island.intersect(anchors)
    const hasContact = Math.abs(contact.area()) > minContactArea
    contact.delete()
    return hasContact
  })
  const result = composeCrossSections(connected)
  for (const island of islands) island.delete()
  network.delete()
  anchors.delete()
  return result
}
