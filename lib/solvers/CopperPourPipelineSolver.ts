import { BasePipelineSolver } from "@tscircuit/solver-utils"
import { getBoardPolygon } from "./copper-pour/get-board-polygon"
import Flatten from "@flatten-js/core"
import { processObstaclesForPour } from "./copper-pour/process-obstacles"
import { generateBRep } from "./copper-pour/generate-brep"
import type { BRepShape } from "circuit-json"
import type { InputProblem, PipelineOutput } from "lib/types"

export class CopperPourPipelineSolver extends BasePipelineSolver<InputProblem> {
  pipelineDef = []
  constructor(public input: InputProblem) {
    super(input)
  }

  override getOutput(): PipelineOutput {
    const brep_shapes: BRepShape[] = []

    for (const region of this.input.regionsForPour) {
      const boardPolygon = getBoardPolygon(region)

      const padsForLayer = this.input.pads.filter(
        (p) => p.layer === region.layer,
      )

      const { polygonsToSubtract } = processObstaclesForPour(
        padsForLayer,
        region.connectivityKey,
        {
          padMargin: region.padMargin,
          traceMargin: region.traceMargin,
        },
      )

      let pourPolygons: Flatten.Polygon = boardPolygon

      for (const poly of polygonsToSubtract) {
        pourPolygons = Flatten.BooleanOperations.subtract(
          pourPolygons,
          poly,
        ) as Flatten.Polygon
      }

      const new_breps = generateBRep(pourPolygons)
      brep_shapes.push(...new_breps)
    }

    return {
      brep_shapes,
    }
  }
}
