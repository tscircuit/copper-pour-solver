import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("pour conversion retains wire-to-via copper on the physical wire layer", async () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 12,
      height: 8,
      num_layers: 4,
    },
    {
      type: "source_net",
      source_net_id: "ground",
      name: "GND",
      subcircuit_connectivity_map_key: "ground",
    },
    {
      type: "source_trace",
      source_trace_id: "signal",
      connected_source_net_ids: [],
      connected_source_port_ids: [],
      subcircuit_connectivity_map_key: "signal",
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "retained",
      source_trace_id: "signal",
      subcircuit_connectivity_map_key: "signal",
      route: [
        { route_type: "wire", x: -3, y: 0, width: 0.4, layer: "top" },
        {
          route_type: "via",
          x: -1,
          y: 0,
          from_layer: "top",
          to_layer: "bottom",
        },
        { route_type: "wire", x: 1, y: 0, width: 0.6, layer: "bottom" },
        { route_type: "wire", x: 3, y: 0, width: 0.6, layer: "bottom" },
      ],
    },
    {
      type: "pcb_via",
      pcb_via_id: "barrel",
      pcb_trace_id: "retained",
      x: -1,
      y: 0,
      outer_diameter: 0.6,
      hole_diameter: 0.3,
      layers: ["top", "inner1", "inner2", "bottom"],
      subcircuit_connectivity_map_key: "signal",
    },
    {
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: "description",
      anchor_alignment: "center",
      anchor_position: { x: 0, y: 3 },
      font: "tscircuit2024",
      font_size: 0.4,
      layer: "top",
      text: "Wire-to-via copper needs clearance",
      ccw_rotation: 0,
    },
  ] as AnyCircuitElement[]
  const options = {
    layer: "top" as const,
    source_net_id: "ground",
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
  await expect(
    runSolverAndRenderToSvg(circuitJson, { ...options, net_name: "GND" }),
  ).toMatchSvgSnapshot(import.meta.path, "wire-via-pour-clearance")

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
  const bottomWires = bottom.pads.filter((pad) => pad.shape === "trace")
  expect(bottomWires).toHaveLength(1)
  expect(bottomWires[0]).toMatchObject({
    layer: "bottom",
    width: 0.6,
    segments: [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 0 },
    ],
  })
  const inner = convertCircuitJsonToInputProblem(circuitJson, {
    ...options,
    layer: "inner1",
  })
  expect(inner.pads.filter((pad) => pad.shape === "trace")).toHaveLength(0)
  expect(inner.pads.find((pad) => pad.padId === "barrel")).toBeDefined()
  const consecutiveVias = structuredClone(circuitJson)
  const gappedTrace = consecutiveVias.find(
    (element) => element.type === "pcb_trace",
  )!
  if (gappedTrace.type !== "pcb_trace")
    throw new Error("Missing retained trace")
  gappedTrace.route = [
    { route_type: "wire", x: -3, y: 0, width: 0.4, layer: "top" },
    { route_type: "via", x: -1, y: 0, from_layer: "top", to_layer: "inner1" },
    { route_type: "via", x: 1, y: 0, from_layer: "inner1", to_layer: "bottom" },
    { route_type: "wire", x: 3, y: 0, width: 0.6, layer: "bottom" },
  ]
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
