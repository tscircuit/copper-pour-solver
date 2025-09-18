import { BasePipelineSolver } from "@tscircuit/solver-utils"
import type { InputProblem, PipelineOutput } from "../types"

export class CopperPourPipelineSolver extends BasePipelineSolver {
  constructor(public input: InputProblem) {
    super()
  }

  getOutput(): PipelineOutput {
    return {
      // ???
    }
  }
}
