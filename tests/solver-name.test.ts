import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "../lib"

test("CopperPourPipelineSolver has a stable solver name", () => {
  expect(CopperPourPipelineSolver.solverName).toBe("CopperPourPipelineSolver")
})
