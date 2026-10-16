import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import type { PcbCutoutRect } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

const clearance = 0.3
const slotWidth = 6
const slotHeight = 1

const getRotatedRectExtents = (
  width: number,
  height: number,
  rotationDegrees: number,
) => {
  const radians = (rotationDegrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  return {
    halfWidth: (width * cos + height * sin) / 2,
    halfHeight: (width * sin + height * cos) / 2,
  }
}

test("rotated rect cutout keeps its rotation in the copper pour", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={16} height={12} routingDisabled>
      <net name="GND" isGroundNet />
      <pcbnotetext
        text="45 deg rect cutout, 0.3 mm clearance"
        pcbY={5}
        fontSize={0.5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const slot: PcbCutoutRect = {
    type: "pcb_cutout",
    pcb_cutout_id: "pcb_cutout_rotated_slot",
    shape: "rect",
    center: { x: 0, y: 0 },
    width: slotWidth,
    height: slotHeight,
    rotation: 45,
  }
  const circuitJson = [...circuit.getCircuitJson(), slot]

  for (const layer of ["top", "bottom"] as const) {
    const input = convertCircuitJsonToInputProblem(circuitJson, {
      layer,
      source_net_name: "GND",
      pad_margin: clearance,
      trace_margin: clearance,
      cutout_margin: clearance,
    })
    expect(
      input.pads.find((pad) => pad.padId === slot.pcb_cutout_id),
    ).toMatchObject({
      shape: "rotated_rect",
      layer,
      connectivityKey: `cutout:${slot.pcb_cutout_id}`,
      x: 0,
      y: 0,
      width: slotWidth,
      height: slotHeight,
      ccwRotation: 45,
    })

    const output = new CopperPourPipelineSolver(input).getOutput()
    expect(output.brep_shapes).toHaveLength(1)
    const rings = output.brep_shapes[0]!.inner_rings
    expect(rings).toHaveLength(1)
    const xs = rings[0]!.vertices.map(({ x }) => x)
    const ys = rings[0]!.vertices.map(({ y }) => y)
    const { halfWidth, halfHeight } = getRotatedRectExtents(
      slotWidth + clearance * 2,
      slotHeight + clearance * 2,
      45,
    )
    expect(Math.max(...xs)).toBeCloseTo(halfWidth, 2)
    expect(Math.min(...xs)).toBeCloseTo(-halfWidth, 2)
    expect(Math.max(...ys)).toBeCloseTo(halfHeight, 2)
    expect(Math.min(...ys)).toBeCloseTo(-halfHeight, 2)
  }

  expect(
    runSolverAndRenderToSvg(circuitJson, {
      layer: "top",
      net_name: "GND",
      pad_margin: clearance,
      trace_margin: clearance,
      cutout_margin: clearance,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})

for (const rotation of [0, 90, 180, 270]) {
  test(`rect cutout rotated ${rotation} deg stays axis aligned`, () => {
    const input = convertCircuitJsonToInputProblem(
      [
        {
          type: "pcb_board",
          pcb_board_id: "pcb_board_0",
          center: { x: 0, y: 0 },
          width: 12,
          height: 12,
          thickness: 1.6,
          num_layers: 2,
          material: "fr4",
        },
        {
          type: "pcb_cutout",
          pcb_cutout_id: "pcb_cutout_0",
          shape: "rect",
          center: { x: 1, y: -1 },
          width: 4,
          height: 2,
          rotation,
        },
      ],
      {
        layer: "top",
        subcircuit_connectivity_map_key: "net_gnd",
        pad_margin: 0.5,
        trace_margin: 0.5,
        cutout_margin: 0,
      },
    )
    const swap = rotation % 180 !== 0
    expect(input.pads).toEqual([
      expect.objectContaining({
        shape: "rect",
        bounds: {
          minX: 1 - (swap ? 1 : 2),
          minY: -1 - (swap ? 2 : 1),
          maxX: 1 + (swap ? 1 : 2),
          maxY: -1 + (swap ? 2 : 1),
        },
      }),
    ])
  })
}
