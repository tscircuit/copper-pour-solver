import { expect, test } from "bun:test"
import type { AnyCircuitElement, BRepShape, SourceNet } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import {
  crossSectionFromPolygon,
  intersectCrossSections,
  subtractCrossSectionBlockers,
} from "lib/solvers/copper-pour/manifold-geometry-adapter"
import { Circuit } from "tscircuit"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

const PadEndpoint = ({
  name,
  x,
  y,
  net,
}: {
  name: string
  x: number
  y: number
  net: string
}) => (
  <testpoint
    name={name}
    pcbX={x}
    pcbY={y}
    layer="bottom"
    connections={{ pin1: `net.${net}` }}
    footprint={
      <footprint>
        <smtpad shape="rect" portHints={["pin1"]} width={0.4} height={0.4} />
      </footprint>
    }
  />
)

test("removes pour islands that do not connect to any copper on the pour net", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={12} height={8}>
      <net name="GND" isGroundNet />
      <net name="SIG_A" />
      <net name="SIG_B" />
      <PadEndpoint name="G_MAIN" x={-4} y={0} net="GND" />
      <PadEndpoint name="G_ISLAND" x={2.4} y={-1.8} net="GND" />
      <PadEndpoint name="SA1" x={1.0} y={1.6} net="SIG_A" />
      <PadEndpoint name="SA2" x={1.0} y={2.0} net="SIG_A" />
      <PadEndpoint name="SB1" x={1.0} y={-2.0} net="SIG_B" />
      <PadEndpoint name="SB2" x={1.0} y={-1.6} net="SIG_B" />
      <trace
        from=".SA1 > .pin1"
        to=".SA2 > .pin1"
        thickness={0.25}
        pcbPath={[
          ".SA1 > .pin1",
          { x: 0, y: -0.9 },
          { x: 3.4, y: -0.9 },
          { x: 3.4, y: 1.3 },
          { x: 0, y: 1.3 },
          ".SA2 > .pin1",
        ]}
      />
      <trace
        from=".SB1 > .pin1"
        to=".SB2 > .pin1"
        thickness={0.25}
        pcbPath={[
          ".SB1 > .pin1",
          { x: 0, y: -0.9 },
          { x: 3.4, y: -0.9 },
          { x: 3.4, y: 1.3 },
          { x: 0, y: 1.3 },
          ".SB2 > .pin1",
        ]}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as AnyCircuitElement[]
  const gndNet = circuitJson.find(
    (elm): elm is SourceNet => elm.type === "source_net" && elm.name === "GND",
  )
  if (!gndNet) throw new Error("Missing GND net")

  const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "bottom",
    source_net_id: gndNet.source_net_id,
    pad_margin: 0.2,
    trace_margin: 0.2,
    board_edge_margin: 0.3,
  })

  const { brep_shapes: shapes } = new CopperPourPipelineSolver(
    inputProblem,
  ).getOutput()

  const probe = ({ cx, cy }: { cx: number; cy: number }) => {
    const box = crossSectionFromPolygon([
      { x: cx - 0.02, y: cy - 0.02 },
      { x: cx + 0.02, y: cy - 0.02 },
      { x: cx + 0.02, y: cy + 0.02 },
      { x: cx - 0.02, y: cy + 0.02 },
    ])
    return shapes.some((shape) => {
      const solid = subtractCrossSectionBlockers(
        crossSectionFromPolygon(shape.outer_ring.vertices),
        shape.inner_rings.map((ring) => crossSectionFromPolygon(ring.vertices)),
      )
      return !intersectCrossSections(solid, box).isEmpty()
    })
  }

  // Main bottom GND pour connected to G_MAIN is retained
  expect(probe({ cx: -2, cy: 0 })).toBe(true)

  // Enclosed pocket WITH G_ISLAND on GND is retained
  expect(probe({ cx: 3.4, cy: -1.8 })).toBe(true)

  // Enclosed pocket WITHOUT any GND copper is removed (KiCad island_removal_mode 0)
  expect(probe({ cx: 2.7, cy: 1.8 })).toBe(false)

  const svg = runSolverAndRenderToSvg(circuitJson, {
    layer: "bottom",
    net_name: "GND",
    pad_margin: 0.2,
    trace_margin: 0.2,
    board_edge_margin: 0.3,
  })
  await expect(svg).toMatchSvgSnapshot(
    import.meta.path,
    "unconnected-island-removal",
  )
})
