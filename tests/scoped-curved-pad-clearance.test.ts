import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputPad, InputProblem } from "lib/types"

test("scoped minimum clearance encloses curved pads between polygon vertices", () => {
  const pads: InputPad[] = [
    {
      shape: "circle",
      padId: "circle",
      layer: "top",
      connectivityKey: "HV",
      x: 0,
      y: 0,
      radius: 0.5,
    },
    {
      shape: "oval",
      padId: "oval",
      layer: "top",
      connectivityKey: "HV",
      x: 0,
      y: 0,
      width: 2,
      height: 1,
      ccwRotation: 0,
    },
    {
      shape: "pill",
      padId: "pill",
      layer: "top",
      connectivityKey: "HV",
      x: 0,
      y: 0,
      width: 2,
      height: 1,
      radius: 0.5,
      ccwRotation: 0,
    },
  ]
  for (const pad of pads) {
    const input: InputProblem = {
      regionsForPour: [
        {
          shape: "rect",
          layer: "top",
          bounds: { minX: -3, minY: -3, maxX: 3, maxY: 3 },
          connectivityKey: "GND",
          padMargin: 0.2,
          traceMargin: 0.2,
          clearanceRules: [{ clearance: 0.2 }],
        },
      ],
      pads: [pad],
    }
    const output = new CopperPourPipelineSolver(input).getOutput()
    const ring = output.brep_shapes[0]!.inner_rings[0]!.vertices
    // Sample the analytic source curve, then measure distance to emitted copper edges.
    for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 128) {
      const point = {
        x:
          (pad.shape === "oval" ? 1 : 0.5) * Math.cos(angle) +
          (pad.shape === "pill" ? 0.5 * Math.sign(Math.cos(angle)) : 0),
        y: 0.5 * Math.sin(angle),
      }
      const gap = Math.min(
        ...ring.map((start, i) =>
          pointToSegmentDistance(point, start, ring[(i + 1) % ring.length]!),
        ),
      )
      expect(gap).toBeGreaterThanOrEqual(0.2)
    }
  }
})
