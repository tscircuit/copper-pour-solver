import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "../lib"

test("CopperPourPipelineSolver has a stable solver name", () => {
  const solver = Object.create(
    CopperPourPipelineSolver.prototype,
  ) as CopperPourPipelineSolver

  expect(solver.getSolverName()).toBe("CopperPourPipelineSolver")
})
