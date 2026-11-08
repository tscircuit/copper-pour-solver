import { BasePipelineSolver } from "@tscircuit/solver-utils"
import type { BRepShape } from "circuit-json"
import type { InputProblem, PipelineOutput } from "lib/types"
import { generateBRep } from "./copper-pour/generate-brep"
import { applyCrosshatch } from "./copper-pour/apply-crosshatch"
import { getBoardPolygon } from "./copper-pour/get-board-polygon"
import {
  crossSectionToCopperPourIslands,
  offsetCrossSection,
  removeTinyIslands,
  subtractCrossSectionBlockers,
  subtractBlockersFromPour,
} from "./copper-pour/manifold-geometry-adapter"
import { isManifoldGeometryInitialized } from "./copper-pour/manifold-runtime"
import { processObstaclesForPour } from "./copper-pour/process-obstacles"
import { getAnchoredPourNetwork } from "./copper-pour/get-anchored-pour-network"
import { MANIFOLD_GEOMETRY_SCALE } from "./copper-pour/polygon-ring"
import { DEFAULT_MIN_ISLAND_AREA } from "./copper-pour/manifold-geometry-adapter"

export class CopperPourPipelineSolver extends BasePipelineSolver<InputProblem> {
  pipelineDef = []
  constructor(public input: InputProblem) {
    super(input)
  }

  override getSolverName(): string {
    return "CopperPourPipelineSolver"
  }

  override getOutput(): PipelineOutput {
    if (!isManifoldGeometryInitialized()) {
      throw new Error(
        "Manifold geometry has not been initialized. Call initializeManifoldGeometry() before solving copper pours.",
      )
    }

    const brep_shapes_by_region: BRepShape[][] = this.input.regionsForPour.map(
      () => [],
    )
    const solvedRegions: Array<{
      regionIndex: number
      layer: string
      connectivityKey: string
      pourMargin: number
      section: ReturnType<typeof subtractBlockersFromPour>
      finalSection: ReturnType<typeof subtractBlockersFromPour>
    }> = []

    // Later regions have higher priority, matching declaration/draw order.
    for (
      let regionIndex = this.input.regionsForPour.length - 1;
      regionIndex >= 0;
      regionIndex--
    ) {
      const region = this.input.regionsForPour[regionIndex]!
      const boardPolygon = getBoardPolygon(region)

      const padsForLayer = this.input.pads.filter(
        (p) => p.layer === region.layer,
      )

      const { polygonsToSubtract, obstaclePolygons } = processObstaclesForPour(
        padsForLayer,
        region.connectivityKey,
        {
          padMargin: region.padMargin,
          traceMargin: region.traceMargin,
          board_edge_margin: region.board_edge_margin,
          cutoutMargin: region.cutout_margin,
          use_thermal_reliefs: region.use_thermal_reliefs,
          thermal_relief_spoke_width: region.thermal_relief_spoke_width,
          thermal_relief_spoke_count: region.thermal_relief_spoke_count,
        },
        region.boardEdgeOutline ?? region.outline,
      )

      const pourMargin =
        region.pourMargin ?? Math.max(region.padMargin, region.traceMargin)
      const higherPriorityPourBlockers = solvedRegions
        .filter(
          (solvedRegion) =>
            solvedRegion.layer === region.layer &&
            solvedRegion.connectivityKey !== region.connectivityKey,
        )
        .map((solvedRegion) =>
          offsetCrossSection(
            solvedRegion.section,
            Math.max(pourMargin, solvedRegion.pourMargin),
          ),
        )

      const pourWithoutComponentObstacles = subtractBlockersFromPour(
        boardPolygon,
        polygonsToSubtract,
      )
      const solidPour = removeTinyIslands(
        subtractCrossSectionBlockers(
          pourWithoutComponentObstacles,
          higherPriorityPourBlockers,
        ),
      )
      const finalPour = region.crosshatch
        ? applyCrosshatch({
            solidPour,
            hatchPitch: region.crosshatchPitch,
            hatchWidth: region.crosshatchWidth,
            padsForLayer,
            connectivityKey: region.connectivityKey,
            obstaclePolygons,
            higherPriorityPourBlockers,
          })
        : solidPour
      const pourIslands = crossSectionToCopperPourIslands(finalPour)

      brep_shapes_by_region[regionIndex] = generateBRep(pourIslands)
      solvedRegions.push({
        regionIndex,
        layer: region.layer,
        connectivityKey: region.connectivityKey,
        pourMargin,
        // Reserve the solid region so lower-priority nets cannot fill hatch openings.
        section: solidPour,
        finalSection: finalPour,
      })
    }

    // Filter only after priority and hatch geometry are final. Regions on the
    // same net/layer may physically connect one another, regardless of order.
    const processedGroups = new Set<string>()
    for (const solved of solvedRegions) {
      const region = this.input.regionsForPour[solved.regionIndex]!
      if (!region.removeFloatingIslands) continue
      const key = JSON.stringify([solved.layer, solved.connectivityKey])
      if (processedGroups.has(key)) continue
      processedGroups.add(key)
      const group = solvedRegions.filter(
        (other) =>
          other.layer === solved.layer &&
          other.connectivityKey === solved.connectivityKey,
      )
      const network = getAnchoredPourNetwork(
        group.map((other) => other.finalSection),
        this.input.pads.filter(
          (pad) =>
            pad.layer === solved.layer &&
            pad.connectivityKey === solved.connectivityKey,
        ),
      )
      for (const member of group) {
        if (
          !this.input.regionsForPour[member.regionIndex]!.removeFloatingIslands
        )
          continue
        const islands = member.finalSection.decompose()
        const connected = islands.filter((island) => {
          const contact = island.intersect(network)
          const anchored =
            Math.abs(contact.area()) >
            DEFAULT_MIN_ISLAND_AREA * MANIFOLD_GEOMETRY_SCALE ** 2
          contact.delete()
          return anchored
        })
        // Keep complete original islands, avoiding boolean-rounding changes to
        // the connected copper while removing the disconnected islands.
        brep_shapes_by_region[member.regionIndex] = generateBRep(
          connected.flatMap(crossSectionToCopperPourIslands),
        )
        for (const island of islands) island.delete()
      }
      network.delete()
    }

    return {
      brep_shapes: brep_shapes_by_region.flat(),
      brep_shapes_by_region,
    }
  }
}
