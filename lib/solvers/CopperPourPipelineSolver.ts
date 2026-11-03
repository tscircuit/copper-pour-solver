import { BasePipelineSolver } from "@tscircuit/solver-utils"
import type { BRepShape } from "circuit-json"
import type { InputProblem, PipelineOutput } from "lib/types"
import { applyCrosshatch } from "./copper-pour/apply-crosshatch"
import { generateBRep } from "./copper-pour/generate-brep"
import { getBoardPolygon } from "./copper-pour/get-board-polygon"
import {
  crossSectionToCopperPourIslands,
  intersectCrossSections,
  offsetCrossSection,
  removeTinyIslands,
  subtractBlockersFromPour,
  subtractCrossSectionBlockers,
} from "./copper-pour/manifold-geometry-adapter"
import { isManifoldGeometryInitialized } from "./copper-pour/manifold-runtime"
import { processObstaclesForPour } from "./copper-pour/process-obstacles"
import { getForeignPourClearance } from "./copper-pour/get-foreign-pour-clearance"

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
      layer: string
      connectivityKey: string
      regionIndex: number
      section: ReturnType<typeof subtractBlockersFromPour>
    }> = []

    // Later regions have higher priority, matching declaration/draw order.
    const regionIndices = this.input.regionsForPour
      .map((_, index) => index)
      .sort(
        (a, b) =>
          Number(Boolean(this.input.regionsForPour[b]?.isStatic)) -
            Number(Boolean(this.input.regionsForPour[a]?.isStatic)) || b - a,
      )
    for (const regionIndex of regionIndices) {
      const region = this.input.regionsForPour[regionIndex]!
      const boardPolygon = getBoardPolygon(region)

      const padsForLayer = this.input.pads.filter(
        (p) => p.layer === region.layer,
      )

      const pourMargins = {
        padMargin: region.padMargin,
        traceMargin: region.traceMargin,
        board_edge_margin: region.board_edge_margin,
        cutoutMargin: region.cutout_margin,
        use_thermal_reliefs: region.use_thermal_reliefs,
        thermal_relief_spoke_width: region.thermal_relief_spoke_width,
        thermal_relief_spoke_count: region.thermal_relief_spoke_count,
        clearanceRules: region.clearanceRules,
      }
      const marginOutline = region.boardEdgeOutline ?? region.outline
      const { polygonsToSubtract, obstaclePolygons } = processObstaclesForPour(
        region.isStatic ? [] : padsForLayer,
        region.connectivityKey,
        pourMargins,
        region.isStatic ? undefined : marginOutline,
      )

      const higherPriorityPourBlockers = solvedRegions
        .filter(
          (solvedRegion) =>
            solvedRegion.layer === region.layer &&
            solvedRegion.connectivityKey !== region.connectivityKey,
        )
        .map((solvedRegion) =>
          offsetCrossSection(
            solvedRegion.section,
            getForeignPourClearance(
              region,
              this.input.regionsForPour[solvedRegion.regionIndex]!,
            ),
          ),
        )

      const pourWithoutComponentObstacles = subtractBlockersFromPour(
        boardPolygon,
        region.isStatic ? [] : polygonsToSubtract,
      )
      const boardOutline = region.boardOutline ?? region.boardEdgeOutline
      const boardSection =
        !region.isStatic && boardOutline?.length
          ? subtractBlockersFromPour(
              boardOutline,
              processObstaclesForPour([], undefined, pourMargins, boardOutline)
                .polygonsToSubtract,
            )
          : undefined
      const clippedPour =
        boardSection && !region.isStatic
          ? intersectCrossSections(pourWithoutComponentObstacles, boardSection)
          : pourWithoutComponentObstacles

      const solidPour = region.isStatic
        ? clippedPour
        : removeTinyIslands(
            subtractCrossSectionBlockers(
              clippedPour,
              higherPriorityPourBlockers,
            ),
          )
      const finalPour =
        region.crosshatch && !region.isStatic
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
        layer: region.layer,
        connectivityKey: region.connectivityKey,
        regionIndex,
        // Reserve the solid region so lower-priority nets cannot fill hatch openings.
        section: solidPour,
      })
    }

    return {
      brep_shapes: brep_shapes_by_region.flat(),
      brep_shapes_by_region,
    }
  }
}
