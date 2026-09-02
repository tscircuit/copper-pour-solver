import type { InputPad, InputPourRegion } from "lib/types"
import { inputPadToPolygons } from "./input-pad-to-polygons"
import {
  crossSectionFromPolygons,
  intersectCrossSections,
  unionCrossSections,
} from "./manifold-geometry-adapter"
import type { CrossSection } from "./manifold-runtime"

interface RemoveDisconnectedIslandsInput {
  regions: InputPourRegion[]
  pads: InputPad[]
  sections: CrossSection[]
}

export const removeDisconnectedIslands = ({
  regions,
  pads,
  sections,
}: RemoveDisconnectedIslandsInput): CrossSection[] => {
  const filteredSections = [...sections]
  const regionIndicesByNet = new Map<string, number[]>()

  for (const [regionIndex, region] of regions.entries()) {
    const groupKey = JSON.stringify([region.layer, region.connectivityKey])
    const regionIndices = regionIndicesByNet.get(groupKey) ?? []
    regionIndices.push(regionIndex)
    regionIndicesByNet.set(groupKey, regionIndices)
  }

  for (const regionIndices of regionIndicesByNet.values()) {
    if (
      !regionIndices.some(
        (regionIndex) => regions[regionIndex]?.removeDisconnectedIslands,
      )
    ) {
      continue
    }

    const firstRegion = regions[regionIndices[0]!]
    if (!firstRegion) continue

    const combinedSection = unionCrossSections(
      regionIndices.map((regionIndex) => sections[regionIndex]!),
    )
    const sameNetPadPolygons = pads
      .filter(
        (pad) =>
          pad.layer === firstRegion.layer &&
          pad.connectivityKey === firstRegion.connectivityKey,
      )
      .flatMap((pad) => inputPadToPolygons(pad, 0))
    const rootSections = [
      crossSectionFromPolygons(sameNetPadPolygons),
      ...regionIndices
        .filter(
          (regionIndex) => !regions[regionIndex]?.removeDisconnectedIslands,
        )
        .map((regionIndex) => sections[regionIndex]!),
    ]
    const rootSection = unionCrossSections(rootSections)
    const connectedSection = unionCrossSections(
      combinedSection
        .decompose()
        .filter(
          (island) => !intersectCrossSections(island, rootSection).isEmpty(),
        ),
    )

    for (const regionIndex of regionIndices) {
      if (!regions[regionIndex]?.removeDisconnectedIslands) continue
      filteredSections[regionIndex] = intersectCrossSections(
        sections[regionIndex]!,
        connectedSection,
      )
    }
  }

  return filteredSections
}
