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
import { removeUnconnectedIslands } from "./copper-pour/remove-unconnected-islands"

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
    const layers = [
      ...new Set(this.input.regionsForPour.map((region) => region.layer)),
    ]

    for (const layer of layers) {
      const padsForLayer = this.input.pads.filter((p) => p.layer === layer)
      const regionIndicesForLayer: number[] = []
      for (
        let index = this.input.regionsForPour.length - 1;
        index >= 0;
        index--
      ) {
        if (this.input.regionsForPour[index]?.layer === layer) {
          regionIndicesForLayer.push(index)
        }
      }

      const solvedRegionsForLayer: Array<{
        connectivityKey: string
        pourMargin: number
        section: ReturnType<typeof subtractBlockersFromPour>
      }> = []

      let cursor = 0
      while (cursor < regionIndicesForLayer.length) {
        const firstIndex = regionIndicesForLayer[cursor]
        if (firstIndex === undefined) break
        const firstRegion = this.input.regionsForPour[firstIndex]
        if (!firstRegion) break

        const batchConnectivityKey = firstRegion.connectivityKey
        const batchIndices: number[] = []
        while (cursor < regionIndicesForLayer.length) {
          const candidateIndex = regionIndicesForLayer[cursor]
          const candidate =
            candidateIndex !== undefined
              ? this.input.regionsForPour[candidateIndex]
              : undefined
          if (
            candidateIndex === undefined ||
            !candidate ||
            candidate.connectivityKey !== batchConnectivityKey
          ) {
            break
          }
          batchIndices.push(candidateIndex)
          cursor++
        }

        const pendingBatch = batchIndices.flatMap((regionIndex) => {
          const region = this.input.regionsForPour[regionIndex]
          if (!region) return []
          const boardPolygon = getBoardPolygon(region)
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
          const higherPriorityPourBlockers = solvedRegionsForLayer
            .filter(
              (solvedRegion) =>
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
          const clippedPour = boardSection
            ? intersectCrossSections(
                pourWithoutComponentObstacles,
                boardSection,
              )
            : pourWithoutComponentObstacles

          const rawSolidPour = removeTinyIslands(
            subtractCrossSectionBlockers(
              clippedPour,
              higherPriorityPourBlockers,
            ),
          )

          return [
            {
              regionIndex,
              region,
              pourMargin,
              obstaclePolygons,
              higherPriorityPourBlockers,
              rawSolidPour,
            },
          ]
        })

        const sameNetPadsForLayer = padsForLayer.filter(
          (pad) => pad.connectivityKey === batchConnectivityKey,
        )
        const hasSameNetCopperAnywhere =
          sameNetPadsForLayer.length > 0 ||
          this.input.pads.some(
            (pad) => pad.connectivityKey === batchConnectivityKey,
          )
        const connectedPours = removeUnconnectedIslands({
          pourSections: pendingBatch.map((item) => item.rawSolidPour),
          sameNetPads: sameNetPadsForLayer,
          enforceConnectivity: hasSameNetCopperAnywhere,
        })

        for (const [batchOffset, item] of pendingBatch.entries()) {
          const solidPour = connectedPours[batchOffset] ?? item.rawSolidPour
          const finalPour = item.region.crosshatch
            ? applyCrosshatch({
                solidPour,
                hatchPitch: item.region.crosshatchPitch,
                hatchWidth: item.region.crosshatchWidth,
                padsForLayer,
                connectivityKey: item.region.connectivityKey,
                obstaclePolygons: item.obstaclePolygons,
                higherPriorityPourBlockers: item.higherPriorityPourBlockers,
              })
            : solidPour
          const pourIslands = crossSectionToCopperPourIslands(finalPour)

          brep_shapes_by_region[item.regionIndex] = generateBRep(pourIslands)
          solvedRegionsForLayer.push({
            connectivityKey: item.region.connectivityKey,
            pourMargin: item.pourMargin,
            // Reserve the solid region so lower-priority nets cannot fill hatch openings.
            section: solidPour,
          })
        }
      }
    }

    return {
      brep_shapes: brep_shapes_by_region.flat(),
      brep_shapes_by_region,
    }
  }
}
