import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("retained copper without optional ownership metadata still clears a pour", async () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 12,
      height: 8,
      num_layers: 2,
    },
    {
      type: "source_net",
      source_net_id: "ground",
      name: "GND",
      subcircuit_connectivity_map_key: "ground",
    },
    {
      type: "source_trace",
      source_trace_id: "ground-trace",
      connected_source_net_ids: ["ground"],
      connected_source_port_ids: [],
      subcircuit_connectivity_map_key: "ground",
    },
    ...[
      { id: "retained-narrow", y: -1, width: 0.3, layer: "top" },
      { id: "retained-wide", y: 1, width: 0.6, layer: "top" },
      { id: "retained-bottom", y: 0, width: 0.5, layer: "bottom" },
      { id: "same-net-ground", y: -2.5, width: 0.3, layer: "top" },
    ].map(({ id, y, width, layer }) => ({
      type: "pcb_trace",
      pcb_trace_id: id,
      ...(id === "same-net-ground"
        ? { source_trace_id: "ground-trace" }
        : {}),
      route: [
        { route_type: "wire", x: -3, y, width, layer },
        { route_type: "wire", x: 3, y, width, layer },
      ],
    })),
    {
      type: "pcb_silkscreen_text",
      pcb_silkscreen_text_id: "description",
      anchor_alignment: "center",
      anchor_position: { x: 0, y: 3 },
      font: "tscircuit2024",
      font_size: 0.4,
      layer: "top",
      text: "Retained traces need pour clearance",
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
  const input = convertCircuitJsonToInputProblem(circuitJson, options)
  const output = new CopperPourPipelineSolver(input).getOutput()
  const svg = runSolverAndRenderToSvg(circuitJson, {
    ...options,
    net_name: "GND",
  })

  await expect(svg).toMatchSvgSnapshot(
    import.meta.path,
    "retained-trace-without-connectivity-metadata",
  )
  const retained = input.pads.filter((pad) =>
    pad.padId.startsWith("retained-"),
  )
  expect(retained).toHaveLength(2)
  expect(new Set(retained.map((pad) => pad.connectivityKey)).size).toBe(2)
  expect(retained.every((pad) => pad.layer === "top")).toBe(true)
  expect(
    retained.every(
      (pad) => pad.connectivityKey !== input.regionsForPour[0]!.connectivityKey,
    ),
  ).toBe(true)
  expect(output.brep_shapes).toHaveLength(1)
  expect(output.brep_shapes[0]!.inner_rings).toHaveLength(2)
  expect(JSON.stringify(circuitJson)).toBe(before)
})
