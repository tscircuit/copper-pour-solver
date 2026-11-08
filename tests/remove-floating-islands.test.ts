import { expect, test } from "bun:test"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputProblem, InputPourRegion } from "lib/types"

const region = (minX: number, maxX: number): InputPourRegion => ({
  shape: "rect",
  layer: "top",
  bounds: { minX, maxX, minY: 0, maxY: 4 },
  connectivityKey: "GND",
  padMargin: 0.2,
  traceMargin: 0.2,
  removeFloatingIslands: true,
})

test("removal follows physical same-net regions, traces and thermal spokes without changing defaults", () => {
  const input: InputProblem = {
    regionsForPour: [region(0, 4), region(3, 7), region(9, 12)],
    pads: [
      {
        shape: "circle",
        padId: "anchor",
        layer: "top",
        connectivityKey: "GND",
        x: 1,
        y: 2,
        radius: 0.5,
        isPlatedHole: true,
      },
    ],
  }
  const solve = () =>
    new CopperPourPipelineSolver(input).getOutput().brep_shapes_by_region
  expect(solve().map((x) => x.length)).toEqual([1, 1, 0])
  input.pads.push({
    ...input.pads[0]!,
    padId: "wrong-layer",
    layer: "bottom",
    x: 10,
  } as (typeof input.pads)[0])
  input.pads.push({
    ...input.pads[0]!,
    padId: "wrong-net",
    connectivityKey: "VCC",
    x: 10,
  } as (typeof input.pads)[0])
  expect(solve().map((x) => x.length)).toEqual([1, 1, 0])
  input.regionsForPour[2]!.removeFloatingIslands = false
  const preserved = solve()[2]
  expect(preserved).toHaveLength(1)
  delete input.regionsForPour[2]!.removeFloatingIslands
  expect(solve()[2]).toEqual(preserved)
  input.regionsForPour[2]!.removeFloatingIslands = true
  input.pads.push({
    shape: "trace",
    padId: "bridge",
    layer: "top",
    connectivityKey: "GND",
    width: 0.3,
    segments: [
      { x: 6, y: 1 },
      { x: 11, y: 1 },
    ],
  })
  expect(solve().map((x) => x.length)).toEqual([1, 1, 1])
  input.regionsForPour[0]!.use_thermal_reliefs = true
  input.regionsForPour[0]!.thermal_relief_spoke_width = 0.25
  input.regionsForPour[0]!.crosshatch = true
  expect(solve().map((x) => x.length)).toEqual([1, 1, 1])
  input.pads = []
  expect(solve().map((x) => x.length)).toEqual([0, 0, 0])
})
