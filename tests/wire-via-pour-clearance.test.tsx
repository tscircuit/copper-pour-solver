import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import type { AnyCircuitElement, BRepShape } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { crossSectionFromPolygons } from "lib/solvers/copper-pour/manifold-geometry-adapter"
import { MANIFOLD_GEOMETRY_SCALE } from "lib/solvers/copper-pour/polygon-ring"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

const Endpoint = ({
  name,
  x,
  y = 0,
  layer = "top",
  net = "SIGNAL",
}: {
  name: string
  x: number
  y?: number
  layer?: "top" | "bottom"
  net?: string
}) => (
  <resistor
    name={name}
    resistance="10k"
    footprint="0603"
    pcbX={x + (layer === "top" ? -0.825 : 0.825)}
    pcbY={y}
    layer={layer}
    connections={{ pin2: `net.${net}` }}
  />
)

const WireViaRepro = ({
  status = "Measuring physical copper",
  consecutiveVias = false,
}) => (
  <board
    width={14}
    height={10}
    layers={4}
    pcbStyle={{ viaHoleDiameter: 0.3, viaPadDiameter: 0.6 }}
  >
    <net name="GND" isGroundNet />
    <net name="SIGNAL" />
    <net name="BOTTOM_ONLY" />
    <Endpoint name="R1" x={-3} />
    <Endpoint name="R2" x={3} layer="bottom" />
    <Endpoint name="R3" x={-3} y={-2.5} layer="bottom" net="BOTTOM_ONLY" />
    <Endpoint name="R4" x={3} y={-2.5} layer="bottom" net="BOTTOM_ONLY" />
    <trace
      from=".R1 > .pin2"
      to=".R2 > .pin2"
      thickness={0.4}
      pcbPaths={[
        consecutiveVias
          ? [
              ".R1 > .pin2",
              {
                x: 2.825,
                y: 0,
                via: true,
                fromLayer: "top",
                toLayer: "inner1",
              },
              {
                x: 4.825,
                y: 0,
                via: true,
                fromLayer: "inner1",
                toLayer: "bottom",
              },
              ".R2 > .pin2",
            ]
          : [
              ".R1 > .pin2",
              {
                x: 2.825,
                y: 0,
                via: true,
                fromLayer: "top",
                toLayer: "bottom",
              },
              { x: 4.825, y: 0 },
              ".R2 > .pin2",
            ],
      ]}
    />
    <trace
      from=".R3 > .pin2"
      to=".R4 > .pin2"
      thickness={0.6}
      pcbPath={[".R3 > .pin2", ".R4 > .pin2"]}
    />
    <copperpour
      layer="top"
      connectsTo="net.GND"
      traceMargin={0.2}
      padMargin={0.2}
    />
    <pcbnotetext
      text="Wire-to-via copper must clear the TOP GND pour"
      pcbY={4.3}
      fontSize={0.4}
      color="#ffffff"
    />
    <pcbnotetext text={status} pcbY={3.6} fontSize={0.32} color="#facc15" />
    <pcbnotetext
      text="R1.2 (0603) → TOP signal: 0.40 mm"
      pcbX={-2.8}
      pcbY={1.8}
      fontSize={0.3}
      color="#facc15"
    />
    <pcbnotetext
      text="BOTTOM → R2.2 (0603)"
      pcbX={2.5}
      pcbY={1.1}
      fontSize={0.3}
      color="#c4b5fd"
    />
    <pcbnotetext
      text="Actual through-via: 0.60 / 0.30 mm"
      pcbX={0}
      pcbY={-1.1}
      fontSize={0.28}
      color="#facc15"
    />
    <pcbnoteline
      x1={-1}
      y1={-0.8}
      x2={-1}
      y2={-0.25}
      strokeWidth={0.05}
      color="#facc15"
    />
    <pcbnotetext
      text="BOTTOM-only 0.60 mm control: no TOP blocker"
      pcbY={-3.2}
      fontSize={0.3}
      color="#c4b5fd"
    />
    <pcbnotetext
      text="Expected: 0 overlap; 0.20 mm clearance along the entire TOP wire"
      pcbY={-4.2}
      fontSize={0.3}
      color="#ffffff"
    />
  </board>
)

const compileCircuit = async (status?: string, consecutiveVias = false) => {
  const circuit = new Circuit()
  circuit.pcbRoutingDisabled = true
  circuit.add(
    <WireViaRepro status={status} consecutiveVias={consecutiveVias} />,
  )
  await circuit.renderUntilSettled()
  expect(
    circuit.getCircuitJson().filter((e) => e.type.includes("error")),
  ).toEqual([])
  // Repour the existing Core-compiled copper. No route, via geometry or
  // ownership metadata is changed to trigger this independent endpoint bug.
  return circuit
    .getCircuitJson()
    .filter((e) => e.type !== "pcb_copper_pour") as AnyCircuitElement[]
}

const topWireOverlapArea = (shapes: BRepShape[], width: number) => {
  // Probe the real wire body between the standard 0603 pad clearance and via clearance.
  const wire = crossSectionFromPolygons([
    [
      { x: -2.4, y: -width / 2 },
      { x: -1.5, y: -width / 2 },
      { x: -1.5, y: width / 2 },
      { x: -2.4, y: width / 2 },
    ],
  ])
  let area = 0
  try {
    for (const shape of shapes) {
      const pour = crossSectionFromPolygons(
        [
          shape.outer_ring.vertices,
          ...shape.inner_rings.map((ring) => ring.vertices),
        ],
        "EvenOdd",
      )
      const intersection = pour.intersect(wire)
      area += intersection.area() / MANIFOLD_GEOMETRY_SCALE ** 2
      intersection.delete()
      pour.delete()
    }
  } finally {
    wire.delete()
  }
  return area
}

test("pour conversion retains Core-compiled wire-to-via copper and prevents a short", async () => {
  const circuitJson = await compileCircuit()
  expect(
    circuitJson.filter(
      (element) =>
        element.type === "source_component" &&
        element.ftype === "simple_resistor",
    ),
  ).toHaveLength(4)
  const pads = circuitJson.filter((element) => element.type === "pcb_smtpad")
  expect(pads).toHaveLength(8)
  expect(
    pads.every(
      (pad) => pad.shape === "rect" && pad.width === 0.8 && pad.height === 0.95,
    ),
  ).toBeTrue()
  const ground = circuitJson.find(
    (e) => e.type === "source_net" && e.name === "GND",
  )!
  if (ground.type !== "source_net") throw new Error("Missing compiled GND net")
  const trace = circuitJson.find(
    (e) =>
      e.type === "pcb_trace" && e.route.some((p) => p.route_type === "via"),
  )!
  if (trace.type !== "pcb_trace")
    throw new Error("Missing compiled routed signal")
  const barrel = circuitJson.find((e) => e.type === "pcb_via")!
  expect(trace.source_trace_id).toBeDefined()
  expect(trace.route).toMatchObject([
    { route_type: "wire", x: -3, y: 0, width: 0.4, layer: "top" },
    { route_type: "via", x: -1, y: 0, from_layer: "top", to_layer: "bottom" },
    { route_type: "wire", x: 1, y: 0, width: 0.4, layer: "bottom" },
    { route_type: "wire", x: 3, y: 0, width: 0.4, layer: "bottom" },
  ])
  for (const endpoint of [trace.route[0]!, trace.route.at(-1)!]) {
    if (endpoint.route_type !== "wire")
      throw new Error("Expected a wire endpoint on a standard footprint pad")
    expect(
      pads.some(
        (pad) =>
          pad.x === endpoint.x &&
          pad.y === endpoint.y &&
          pad.layer === endpoint.layer,
      ),
    ).toBeTrue()
  }
  expect(barrel).toMatchObject({
    type: "pcb_via",
    x: -1,
    y: 0,
    outer_diameter: 0.6,
    hole_diameter: 0.3,
    layers: ["top", "inner1", "inner2", "bottom"],
  })
  const options = {
    layer: "top" as const,
    source_net_id: ground.source_net_id,
    pad_margin: 0.2,
    trace_margin: 0.2,
  }
  const before = JSON.stringify(circuitJson)
  const top = convertCircuitJsonToInputProblem(circuitJson, options)
  const bottom = convertCircuitJsonToInputProblem(circuitJson, {
    ...options,
    layer: "bottom",
  })
  const output = new CopperPourPipelineSolver(top).getOutput()
  const overlap = topWireOverlapArea(output.brep_shapes, 0.4)
  const clearanceOverlap = topWireOverlapArea(output.brep_shapes, 0.8)
  const status =
    overlap > 1e-6
      ? `FAIL: GND shorts the TOP wire (${overlap.toFixed(2)} mm2 body overlap)`
      : "FIXED: TOP wire has 0.20 mm clearance; no different-net short"
  const labeled = await compileCircuit(status)
  await expect(
    runSolverAndRenderToSvg(labeled, { ...options, net_name: "GND" }),
  ).toMatchSvgSnapshot(import.meta.path, "wire-via-pour-clearance")

  expect(overlap).toBeLessThan(1e-6)
  expect(clearanceOverlap).toBeLessThan(1e-6)
  const topWires = top.pads.filter((pad) => pad.shape === "trace")
  expect(topWires).toHaveLength(1)
  expect(topWires[0]).toMatchObject({
    layer: "top",
    width: 0.4,
    segments: [
      { x: -3, y: 0 },
      { x: -1, y: 0 },
    ],
  })
  const bottomWires = bottom.pads.filter(
    (pad) =>
      pad.shape === "trace" && pad.padId.startsWith(`${trace.pcb_trace_id}-`),
  )
  expect(bottomWires).toHaveLength(1)
  expect(bottomWires[0]).toMatchObject({
    layer: "bottom",
    width: 0.4,
    segments: [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 0 },
    ],
  })
  expect(
    bottom.pads.filter((pad) => pad.shape === "trace" && pad.width === 0.6),
  ).toHaveLength(1)
  const inner = convertCircuitJsonToInputProblem(circuitJson, {
    ...options,
    layer: "inner1",
  })
  expect(inner.pads.filter((pad) => pad.shape === "trace")).toHaveLength(0)
  if (barrel.type !== "pcb_via") throw new Error("Missing compiled barrel")
  expect(
    inner.pads.find((pad) => pad.padId === barrel.pcb_via_id),
  ).toBeDefined()
  const consecutiveVias = await compileCircuit(undefined, true)
  const missingInnerWire = convertCircuitJsonToInputProblem(consecutiveVias, {
    ...options,
    layer: "inner1",
  })
  expect(
    missingInnerWire.pads.filter((pad) => pad.shape === "trace"),
  ).toHaveLength(0)
  expect(output.brep_shapes).toHaveLength(1)
  expect(output.brep_shapes[0]!.inner_rings).toHaveLength(1)
  expect(
    Math.min(
      ...output.brep_shapes[0]!.inner_rings[0]!.vertices.map(
        (point) => point.x,
      ),
    ),
  ).toBeLessThan(-3.39)
  expect(JSON.stringify(circuitJson)).toBe(before)
})
