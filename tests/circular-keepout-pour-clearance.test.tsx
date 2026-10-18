import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import type { CircuitJson } from "circuit-json"
import { renderPcbLayers } from "./fixtures/render-pcb-layers"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

const measureClearance = async (
  ring: { x: number; y: number }[],
  radius: number,
) => {
  const center = { x: 1, y: -1 }
  // The distance from the center to every emitted straight cutout edge must
  // be at least the declared radius, not merely its vertices' distance.
  const distances = ring.map((a, index) => {
    const b = ring[(index + 1) % ring.length]!
    const dx = b.x - a.x,
      dy = b.y - a.y
    const t = Math.max(
      0,
      Math.min(
        1,
        ((center.x - a.x) * dx + (center.y - a.y) * dy) / (dx * dx + dy * dy),
      ),
    )
    return Math.hypot(a.x + t * dx - center.x, a.y + t * dy - center.y)
  })
  const minimum = Math.min(...distances)
  const polygon = ring.map((point) => `${point.x},${-point.y}`).join(" ")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/><g font-family="sans-serif" font-size="17" fill="#222" text-anchor="middle"><text x="400" y="30">The copper-pour solver cuts keepouts out of PCB copper.</text><text x="400" y="60">Radius ${radius} mm; nearest copper edge ${minimum.toFixed(6)} mm. Expected at least ${radius}.</text></g><g transform="translate(360 290) scale(32)"><rect x="-6" y="-6" width="12" height="12" fill="#ca8e48"/><polygon points="${polygon}" fill="white"/><circle cx="1" cy="1" r="${radius}" fill="none" stroke="#bf3030" stroke-width="0.025"/></g></svg>`
  if (process.env.SNAPSHOT_DIR)
    await Bun.write(`${process.env.SNAPSHOT_DIR}/radius-${radius}.svg`, svg)
  return { minimum, svg }
}

async function checkClearance(
  circuitJson: CircuitJson,
  radius: number,
  snapshotName: string,
) {
  const input = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "inner1",
    source_net_name: "GND",
    pad_margin: 0,
    trace_margin: 0,
    board_edge_margin: 0,
  })
  expect(input.pads).toHaveLength(1)
  expect(input.pads[0]).toMatchObject({
    shape: "circle",
    x: 1,
    y: -1,
    radius,
    layer: "inner1",
  })
  const output = new CopperPourPipelineSolver(input).getOutput()
  const { minimum } = await measureClearance(
    output.brep_shapes[0]!.inner_rings![0]!.vertices,
    radius,
  )
  expect(
    runSolverAndRenderToSvg(
      circuitJson,
      {
        layer: "inner1",
        net_name: "GND",
        pad_margin: 0,
        trace_margin: 0,
        board_edge_margin: 0,
      },
      (solved) =>
        renderPcbLayers(
          solved,
          `inner1: radius ${radius} mm; nearest copper ${minimum.toFixed(6)} mm (expected >= ${radius}).`,
        ),
    ),
  ).toMatchSvgSnapshot(import.meta.path, snapshotName)
  expect(minimum).toBeGreaterThanOrEqual(radius - 1e-6)
}

test.failing("copper stays outside a 0.5 mm circular keepout", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={12} height={12} layers={4} routingDisabled>
      <net name="GND" isGroundNet />
      <keepout
        shape="circle"
        radius={0.5}
        pcbX={1}
        pcbY={-1}
        layers={["inner1"]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  await checkClearance(
    circuit.getCircuitJson(),
    0.5,
    "circular-keepout-0-pcb-layers",
  )
})

test.failing("copper stays outside a 4 mm circular keepout", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={12} height={12} layers={4} routingDisabled>
      <net name="GND" isGroundNet />
      <keepout
        shape="circle"
        radius={4}
        pcbX={1}
        pcbY={-1}
        layers={["inner1"]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  await checkClearance(
    circuit.getCircuitJson(),
    4,
    "circular-keepout-1-pcb-layers",
  )
})
