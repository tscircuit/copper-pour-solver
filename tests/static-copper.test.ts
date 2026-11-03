import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputPourRegion, InputProblem } from "lib/types"
import { hasCopperAt } from "./utils/has-copper-at"

test("authored copper keeps its outline and reserves scoped spacing regardless of declaration order", () => {
  const fixed: InputPourRegion = {
    shape: "rect",
    layer: "top",
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
    connectivityKey: "HV",
    padMargin: 0.1,
    traceMargin: 0.1,
    isStatic: true,
    board_edge_margin: 0.8,
  }
  const generated: InputPourRegion = {
    shape: "rect",
    layer: "top",
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
    connectivityKey: "GND",
    padMargin: 0.1,
    traceMargin: 0.1,
    clearanceRules: [
      {
        clearance: 1.5,
        connectivityKeys: ["HV"],
        objectTypes: ["copper_region"],
      },
    ],
  }
  for (const regions of [
    [fixed, generated],
    [generated, fixed],
  ]) {
    const input: InputProblem = {
      regionsForPour: regions,
      pads: [
        {
          padId: "pad",
          connectivityKey: "OTHER",
          layer: "top",
          shape: "circle",
          x: 0,
          y: 0,
          radius: 0.5,
        },
      ],
    }
    const output = new CopperPourPipelineSolver(input).getOutput()
    const fixedShapes = output.brep_shapes_by_region[regions.indexOf(fixed)]!
    const generatedShapes =
      output.brep_shapes_by_region[regions.indexOf(generated)]!
    expect(hasCopperAt(fixedShapes, { x: 0, y: 0 })).toBe(true)
    expect(hasCopperAt(fixedShapes, { x: 0.99, y: 0 })).toBe(true)
    expect(hasCopperAt(generatedShapes, { x: 2.4, y: 0 })).toBe(false)
    expect(hasCopperAt(generatedShapes, { x: 2.6, y: 0 })).toBe(true)
  }
})
