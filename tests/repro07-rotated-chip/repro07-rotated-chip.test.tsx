import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "../utils/run-solver-and-render-to-svg"

// Asymmetric array and an off-origin chip expose rotation around the wrong origin,
// missing rotation, and applying the component rotation to absolute pad positions twice.
const localPads = [
  { x: -2, y: -1 },
  { x: 0, y: -1 },
  { x: 2, y: -1 },
  { x: -2, y: 1 },
  { x: 0, y: 1 },
]
const center = { x: 3, y: -2 }
const radius = 0.2
const margin = 0.15

for (const rotation of [0, 45, 90, 180, 270]) {
  test(`circular pad clearances follow a chip rotated ${rotation} degrees`, async () => {
    const circuit = new Circuit()
    circuit.add(
      <board width={18} height={14} routingDisabled>
        <net name="GND" isGroundNet />
        <chip
          name="U1"
          pcbX={center.x}
          pcbY={center.y}
          pcbRotation={rotation}
          footprint={
            <footprint>
              {localPads.map((pad, i) => (
                <smtpad
                  {...{ key: i }}
                  shape="circle"
                  radius={radius}
                  pcbX={pad.x}
                  pcbY={pad.y}
                  portHints={[`pin${i + 1}`]}
                />
              ))}
            </footprint>
          }
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const input = convertCircuitJsonToInputProblem(circuitJson, {
      layer: "top",
      source_net_name: "GND",
      pad_margin: margin,
      trace_margin: margin,
    })
    const output = new CopperPourPipelineSolver(input).getOutput()
    expect(output.brep_shapes).toHaveLength(1)
    const rings = output.brep_shapes[0]!.inner_rings
    expect(rings).toHaveLength(localPads.length)
    const angle = (rotation * Math.PI) / 180
    for (const local of localPads) {
      const x = center.x + local.x * Math.cos(angle) - local.y * Math.sin(angle)
      const y = center.y + local.x * Math.sin(angle) + local.y * Math.cos(angle)
      expect(
        input.pads.some(
          (pad) =>
            pad.shape === "circle" && Math.hypot(pad.x - x, pad.y - y) < 1e-6,
        ),
      ).toBe(true)
      // Find the clearance by its geometric center, independent of output ordering.
      const ring = rings.find(({ vertices }) => {
        const cx = vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length
        const cy = vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length
        return Math.hypot(cx - x, cy - y) < 1e-6
      })
      expect(ring).toBeDefined()
      for (const vertex of ring!.vertices) {
        expect(Math.hypot(vertex.x - x, vertex.y - y)).toBeCloseTo(
          radius + margin,
          5,
        )
      }
    }
    if (rotation === 90) {
      await expect(
        runSolverAndRenderToSvg(circuitJson, {
          layer: "top",
          net_name: "GND",
          pad_margin: margin,
          trace_margin: margin,
        }),
      ).toMatchSvgSnapshot(import.meta.path, "rotated-chip-90")
    }
  })
}
