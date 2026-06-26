import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import { convertCircuitJsonToInputProblem } from "lib/circuit-json/convert-circuit-json-to-input-problem"

const circuitJson = [
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_0",
    center: { x: 0, y: 0 },
    width: 10,
    height: 10,
    thickness: 1.4,
    num_layers: 2,
    material: "fr4",
  },
  {
    type: "source_net",
    source_net_id: "source_net_gnd",
    name: "GND",
    subcircuit_connectivity_map_key: "stable_subcircuit_net_gnd",
  },
  {
    type: "source_trace",
    source_trace_id: "source_trace_gnd",
    connected_source_net_ids: ["source_net_gnd"],
    connected_source_port_ids: ["source_port_gnd"],
    subcircuit_connectivity_map_key: "stable_subcircuit_net_gnd",
  },
  {
    type: "source_port",
    source_port_id: "source_port_gnd",
    source_component_id: "source_component_r1",
    name: "1",
    subcircuit_connectivity_map_key: "stable_subcircuit_net_gnd",
  },
  {
    type: "pcb_port",
    pcb_port_id: "pcb_port_gnd",
    pcb_component_id: "pcb_component_r1",
    source_port_id: "source_port_gnd",
    x: 0,
    y: 0,
    layers: ["top"],
  },
  {
    type: "pcb_smtpad",
    pcb_smtpad_id: "pcb_smtpad_gnd",
    pcb_component_id: "pcb_component_r1",
    pcb_port_id: "pcb_port_gnd",
    layer: "top",
    shape: "rect",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    port_hints: ["1"],
  },
] as AnyCircuitElement[]

test("circuit-json adapter resolves pours to subcircuit connectivity keys", () => {
  const connectivityMap = getFullConnectivityMapFromCircuitJson(circuitJson)
  const generatedConnectivityMapKey =
    connectivityMap.getNetConnectedToId("source_net_gnd")

  expect(generatedConnectivityMapKey).toBeDefined()
  expect(generatedConnectivityMapKey).not.toBe("stable_subcircuit_net_gnd")

  const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "top",
    source_net_id: "source_net_gnd",
    pad_margin: 0.2,
    trace_margin: 0.2,
  })

  expect(inputProblem.regionsForPour[0]?.connectivityKey).toBe(
    "stable_subcircuit_net_gnd",
  )
  expect(
    inputProblem.pads.find((pad) => pad.padId === "pcb_smtpad_gnd"),
  ).toMatchObject({
    connectivityKey: "stable_subcircuit_net_gnd",
  })
})

test("circuit-json adapter rejects generated connectivity map keys", () => {
  const generatedConnectivityMapKey =
    getFullConnectivityMapFromCircuitJson(circuitJson).getNetConnectedToId(
      "source_net_gnd",
    )

  expect(() =>
    convertCircuitJsonToInputProblem(circuitJson, {
      layer: "top",
      pour_connectivity_key: generatedConnectivityMapKey!,
      pad_margin: 0.2,
      trace_margin: 0.2,
    }),
  ).toThrow(/subcircuit_connectivity_map_key/)
})

test("circuit-json adapter treats parent and child subcircuit keys as same-net aliases", () => {
  const circuitJsonWithSubcircuitAliases = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
      thickness: 1.4,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "source_net",
      source_net_id: "source_net_parent_vsys",
      name: "VSYS",
      subcircuit_connectivity_map_key: "parent_vsys_key",
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_parent_vsys",
      connected_source_net_ids: ["source_net_parent_vsys"],
      connected_source_port_ids: ["source_port_parent_vsys"],
      subcircuit_connectivity_map_key: "parent_vsys_key",
    },
    {
      type: "source_trace",
      source_trace_id: "source_trace_pico_vsys",
      connected_source_net_ids: ["source_net_parent_vsys"],
      connected_source_port_ids: ["source_port_pico_vsys"],
      subcircuit_connectivity_map_key: "pico_vsys_key",
    },
    {
      type: "source_port",
      source_port_id: "source_port_parent_vsys",
      source_component_id: "source_component_parent_connector",
      name: "VSYS",
      subcircuit_connectivity_map_key: "parent_vsys_key",
    },
    {
      type: "source_port",
      source_port_id: "source_port_pico_vsys",
      source_component_id: "source_component_pico",
      name: "VSYS",
      subcircuit_connectivity_map_key: "pico_vsys_key",
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_port_parent_vsys",
      pcb_component_id: "pcb_component_parent_connector",
      source_port_id: "source_port_parent_vsys",
      x: -1,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "pcb_port_pico_vsys",
      pcb_component_id: "pcb_component_pico",
      source_port_id: "source_port_pico_vsys",
      x: 1,
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_parent_vsys",
      pcb_component_id: "pcb_component_parent_connector",
      pcb_port_id: "pcb_port_parent_vsys",
      layer: "top",
      shape: "rect",
      x: -1,
      y: 0,
      width: 1,
      height: 1,
      port_hints: ["VSYS"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pcb_smtpad_pico_vsys",
      pcb_component_id: "pcb_component_pico",
      pcb_port_id: "pcb_port_pico_vsys",
      layer: "top",
      shape: "rect",
      x: 1,
      y: 0,
      width: 1,
      height: 1,
      port_hints: ["VSYS"],
    },
  ] as AnyCircuitElement[]

  const inputProblem = convertCircuitJsonToInputProblem(
    circuitJsonWithSubcircuitAliases,
    {
      layer: "top",
      source_net_id: "source_net_parent_vsys",
      pad_margin: 0.2,
      trace_margin: 0.2,
    },
  )

  expect(inputProblem.regionsForPour[0]?.connectivityKey).toBe(
    "parent_vsys_key",
  )
  expect(
    inputProblem.pads.find((pad) => pad.padId === "pcb_smtpad_parent_vsys"),
  ).toMatchObject({
    connectivityKey: "parent_vsys_key",
  })
  expect(
    inputProblem.pads.find((pad) => pad.padId === "pcb_smtpad_pico_vsys"),
  ).toMatchObject({
    connectivityKey: "parent_vsys_key",
  })
})
