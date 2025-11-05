import type {
  AnyCircuitElement,
  LayerRef,
  PcbBoard,
  PcbHole,
  PcbPlatedHole,
  PcbPort,
  PcbSmtPad,
  PcbTrace,
  SourceNet,
  SourcePort,
  SourceTrace,
} from "circuit-json"
import type {
  InputCircularPad,
  InputPad,
  InputProblem,
  InputRectPad,
  InputTracePad,
} from "lib/types"

export const convertCircuitJsonToInputProblem = (
  circuitJson: AnyCircuitElement[],
  options: {
    layer: LayerRef
    pour_connectivity_key: string
    pad_margin: number
    trace_margin: number
  },
): InputProblem => {
  const source_ports = circuitJson.filter(
    (e) => e.type === "source_port",
  ) as SourcePort[]
  const pcb_ports = circuitJson.filter(
    (e) => e.type === "pcb_port",
  ) as PcbPort[]
  const source_traces = circuitJson.filter(
    (e) => e.type === "source_trace",
  ) as SourceTrace[]
  const source_nets = circuitJson.filter(
    (e) => e.type === "source_net",
  ) as SourceNet[]
  const pcb_board = circuitJson.find((e) => e.type === "pcb_board") as
    | PcbBoard
    | undefined

  if (!pcb_board) throw new Error("No pcb_board found in circuit json")

  const sourcePortIdToConnectivityKey = Object.fromEntries(
    source_ports.map((sp) => [
      sp.source_port_id,
      sp.subcircuit_connectivity_map_key,
    ]),
  )
  const pcbPortIdToConnectivityKey: Record<string, string | undefined> =
    Object.fromEntries(
      pcb_ports.map((pp) => [
        pp.pcb_port_id,
        sourcePortIdToConnectivityKey[pp.source_port_id],
      ]),
    )
  const pcbPlatedHoleIdToConnectivityKey: Record<string, string | undefined> =
    {}
  for (const pcb_port of pcb_ports) {
    if (pcb_port.pcb_port_id) {
      pcbPlatedHoleIdToConnectivityKey[pcb_port.pcb_port_id] =
        pcbPortIdToConnectivityKey[pcb_port.pcb_port_id]
    }
  }

  const sourceTraceIdToConnectivityKey = Object.fromEntries(
    source_traces.map((st) => [
      st.source_trace_id,
      st.subcircuit_connectivity_map_key,
    ]),
  )
  const sourceNetIdToConnectivityKey = Object.fromEntries(
    source_nets.map((sn) => [
      sn.source_net_id,
      sn.subcircuit_connectivity_map_key,
    ]),
  )

  const idToConnectivityKey = {
    ...sourceTraceIdToConnectivityKey,
    ...sourceNetIdToConnectivityKey,
  }

  const pads: InputPad[] = []

  for (const elm of circuitJson) {
    if (elm.type === "pcb_smtpad") {
      const smtpad = elm as PcbSmtPad
      if (smtpad.layer !== options.layer) continue

      let connectivityKey: string | undefined
      if (smtpad.pcb_port_id) {
        connectivityKey = pcbPortIdToConnectivityKey[smtpad.pcb_port_id]
      }
      if (!connectivityKey) {
        connectivityKey = `unconnected:${smtpad.pcb_smtpad_id}`
      }

      if (smtpad.shape === "rect") {
        pads.push({
          shape: "rect",
          padId: smtpad.pcb_smtpad_id,
          layer: smtpad.layer,
          connectivityKey,
          bounds: {
            minX: smtpad.x - smtpad.width! / 2,
            minY: smtpad.y - smtpad.height! / 2,
            maxX: smtpad.x + smtpad.width! / 2,
            maxY: smtpad.y + smtpad.height! / 2,
          },
        } as InputRectPad)
      } else if (smtpad.shape === "circle") {
        pads.push({
          shape: "circle",
          padId: smtpad.pcb_smtpad_id,
          layer: smtpad.layer,
          connectivityKey,
          x: smtpad.x,
          y: smtpad.y,
          radius: smtpad.radius!,
        } as InputCircularPad)
      }
    } else if (elm.type === "pcb_plated_hole") {
      const platedHole = elm as PcbPlatedHole
      if (platedHole.shape !== "circle") continue
      if (!platedHole.layers.includes(options.layer)) continue

      // TODO better connectivity check
      let connectivityKey =
        pcbPlatedHoleIdToConnectivityKey[platedHole.pcb_plated_hole_id]
      if (!connectivityKey) {
        connectivityKey = `unconnected-plated-hole:${platedHole.pcb_plated_hole_id}`
      }

      pads.push({
        shape: "circle",
        padId: platedHole.pcb_plated_hole_id,
        layer: options.layer,
        connectivityKey,
        x: platedHole.x,
        y: platedHole.y,
        radius: platedHole.outer_diameter / 2,
      } as InputCircularPad)
    } else if (elm.type === "pcb_hole") {
      const hole = elm as PcbHole
      if (hole.hole_shape !== "circle") continue

      pads.push({
        shape: "circle",
        padId: hole.pcb_hole_id,
        layer: options.layer, // holes are through-all
        connectivityKey: `hole:${hole.pcb_hole_id}`,
        x: hole.x,
        y: hole.y,
        radius: hole.hole_diameter / 2,
      } as InputCircularPad)
    } else if (elm.type === "pcb_trace") {
      const trace = elm as PcbTrace
      const first_wire = trace.route.find(
        (r: any) => r.route_type === "wire" && r.layer,
      )
      if (!first_wire) continue
      if (first_wire.route_type === "via") continue
      if (first_wire.layer !== options.layer) continue

      if (!trace.source_trace_id) continue
      const connectivityKey = idToConnectivityKey[trace.source_trace_id]
      if (!connectivityKey) continue

      pads.push({
        shape: "trace",
        padId: trace.pcb_trace_id,
        layer: first_wire.layer!,
        connectivityKey,
        segments: trace.route.map((r: any) => ({ x: r.x, y: r.y })),
        width: first_wire.width,
      } as InputTracePad)
    }
  }

  const { width, height } = pcb_board
  const regionsForPour = [
    {
      shape: "rect" as const,
      layer: options.layer,
      bounds: {
        minX: -width / 2,
        minY: -height / 2,
        maxX: width / 2,
        maxY: height / 2,
      },
      outline: pcb_board.outline,
      connectivityKey: options.pour_connectivity_key,
      padMargin: options.pad_margin,
      traceMargin: options.trace_margin,
    },
  ]

  return {
    pads,
    regionsForPour,
  }
}
