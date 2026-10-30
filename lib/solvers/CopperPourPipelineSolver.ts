import { BasePipelineSolver } from "@tscircuit/solver-utils"
import type { BRepShape } from "circuit-json"
import type { InputProblem, PipelineOutput } from "lib/types"
import { applyCrosshatch } from "./copper-pour/apply-crosshatch"
import { generateBRep } from "./copper-pour/generate-brep"
import { getBoardPolygon } from "./copper-pour/get-board-polygon"
import { getInputPadBounds } from "./copper-pour/get-input-pad-bounds"
import { getPadsOverlappingRegion } from "./copper-pour/get-pads-overlapping-region"
import {
  crossSectionFromPolygon,
  crossSectionToCopperPourIslands,
  intersectCrossSections,
  offsetCrossSection,
  removeTinyIslands,
  subtractBlockersFromPour,
  subtractCrossSectionBlockers,
} from "./copper-pour/manifold-geometry-adapter"
import { isManifoldGeometryInitialized } from "./copper-pour/manifold-runtime"
import { processObstaclesForPour } from "./copper-pour/process-obstacles"
import type { CrossSection } from "./copper-pour/manifold-runtime"
import { releaseCrossSections } from "./copper-pour/release-cross-sections"

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
      pourMargin: number
      section: ReturnType<typeof subtractBlockersFromPour>
    }> = []
    const existingCopper = this.input.pads.flatMap((pad) => {
      if (!pad.isCopperPour || pad.shape !== "polygon") return []
      return [
        {
          layer: pad.layer,
          connectivityKey: pad.connectivityKey,
          section: crossSectionFromPolygon(pad.points),
        },
      ]
    })
    const boundedPads = this.input.pads
      .filter((pad) => !pad.isCopperPour)
      .map((pad) => ({
        pad,
        bounds: getInputPadBounds(pad),
      }))

    try {
      // Later regions have higher priority, matching declaration/draw order.
      for (
        let regionIndex = this.input.regionsForPour.length - 1;
        regionIndex >= 0;
        regionIndex--
      ) {
        const temporarySections = new Set<CrossSection | undefined>()
        let retainedSection: CrossSection | undefined
        try {
          const region = this.input.regionsForPour[regionIndex]!
          const boardPolygon = getBoardPolygon(region)

          const padsForLayer = getPadsOverlappingRegion({ boundedPads, region })

          const pourMargins = {
            padMargin: region.padMargin,
            traceMargin: region.traceMargin,
            board_edge_margin: region.board_edge_margin,
            cutoutMargin: region.cutout_margin,
            use_thermal_reliefs: region.use_thermal_reliefs,
            thermal_relief_spoke_width: region.thermal_relief_spoke_width,
            thermal_relief_spoke_count: region.thermal_relief_spoke_count,
          }
          const marginOutline = region.boardEdgeOutline ?? region.outline
          const { polygonsToSubtract, obstaclePolygons } =
            processObstaclesForPour(
              padsForLayer,
              region.connectivityKey,
              pourMargins,
              marginOutline,
            )

          const pourMargin =
            region.pourMargin ?? Math.max(region.padMargin, region.traceMargin)
          const higherPriorityPourBlockers = solvedRegions
            .filter(
              (solvedRegion) =>
                solvedRegion.layer === region.layer &&
                solvedRegion.connectivityKey !== region.connectivityKey,
            )
            .map((solvedRegion) => {
              const offset = offsetCrossSection(
                solvedRegion.section,
                Math.max(pourMargin, solvedRegion.pourMargin),
              )
              if (offset !== solvedRegion.section) temporarySections.add(offset)
              return offset
            })

          // Retain existing copper exactly. Other nets need clearance; the same
          // net needs only subtraction to avoid overlapping duplicate copper.
          const existingCopperBlockers = existingCopper
            .filter((copper) => copper.layer === region.layer)
            .map((copper) => {
              const margin =
                copper.connectivityKey === region.connectivityKey
                  ? 0
                  : pourMargin
              const blocker = offsetCrossSection(copper.section, margin)
              if (blocker !== copper.section) temporarySections.add(blocker)
              return blocker
            })
          higherPriorityPourBlockers.push(...existingCopperBlockers)

          const pourWithoutComponentObstacles = subtractBlockersFromPour(
            boardPolygon,
            polygonsToSubtract,
          )
          temporarySections.add(pourWithoutComponentObstacles)
          const boardOutline = region.boardOutline ?? region.boardEdgeOutline
          const boardSection = boardOutline?.length
            ? subtractBlockersFromPour(
                boardOutline,
                processObstaclesForPour(
                  [],
                  undefined,
                  pourMargins,
                  boardOutline,
                ).polygonsToSubtract,
              )
            : undefined
          temporarySections.add(boardSection)
          const clippedPour = boardSection
            ? intersectCrossSections(
                pourWithoutComponentObstacles,
                boardSection,
              )
            : pourWithoutComponentObstacles
          temporarySections.add(clippedPour)

          const priorityClearedPour = subtractCrossSectionBlockers(
            clippedPour,
            higherPriorityPourBlockers,
          )
          temporarySections.add(priorityClearedPour)
          const solidPour = removeTinyIslands(priorityClearedPour)
          temporarySections.add(solidPour)
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
          temporarySections.add(finalPour)
          const pourIslands = crossSectionToCopperPourIslands(finalPour)

          brep_shapes_by_region[regionIndex] = generateBRep(pourIslands)
          solvedRegions.push({
            layer: region.layer,
            connectivityKey: region.connectivityKey,
            pourMargin,
            // Reserve the solid region so lower-priority nets cannot fill hatch openings.
            section: solidPour,
          })
          retainedSection = solidPour
        } finally {
          releaseCrossSections(temporarySections, retainedSection)
        }
      }

      return {
        brep_shapes: brep_shapes_by_region.flat(),
        brep_shapes_by_region,
      }
    } finally {
      releaseCrossSections([
        ...solvedRegions.map(({ section }) => section),
        ...existingCopper.map(({ section }) => section),
      ])
    }
  }
}
