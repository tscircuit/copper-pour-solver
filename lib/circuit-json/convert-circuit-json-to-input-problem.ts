import type {
  AnyCircuitElement,
  LayerRef,
  PcbBoard,
  PcbHole,
  PcbPlatedHole,
  PcbPort,
  PcbSmtPad,
  PcbTrace,
  PcbVia,
  Point,
  SourceNet,
  SourcePort,
  SourceTrace,
} from "circuit-json"
import type {
  InputCircularPad,
  InputPad,
  InputPolygonPad,
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
    board_edge_margin?: number
    cutout_margin?: number
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
  const pcb_traces = circuitJson.filter(
    (e) => e.type === "pcb_trace",
  ) as PcbTrace[]
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

  const pcbTraceIdToConnectivityKey: Record<string, string> =
    Object.fromEntries(
      pcb_traces
        .map(
          (trace) =>
            [
              trace.pcb_trace_id,
              trace.source_trace_id
                ? idToConnectivityKey[trace.source_trace_id]
                : undefined,
            ] as const,
        )
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    )

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
    } else if (elm.type === "pcb_cutout") {
      const cutout = elm as any
      if (cutout.shape === "rect") {
        pads.push({
          shape: "rect",
          padId: cutout.pcb_cutout_id,
          layer: options.layer, // through-all
          connectivityKey: `cutout:${cutout.pcb_cutout_id}`,
          bounds: {
            minX: cutout.center.x - cutout.width / 2,
            minY: cutout.center.y - cutout.height / 2,
            maxX: cutout.center.x + cutout.width / 2,
            maxY: cutout.center.y + cutout.height / 2,
          },
        } as InputRectPad)
      } else if (cutout.shape === "circle") {
        pads.push({
          shape: "circle",
          padId: cutout.pcb_cutout_id,
          layer: options.layer, // through-all
          connectivityKey: `cutout:${cutout.pcb_cutout_id}`,
          x: cutout.center.x,
          y: cutout.center.y,
          radius: cutout.radius,
        } as InputCircularPad)
      } else if (cutout.shape === "polygon") {
        pads.push({
          shape: "polygon",
          padId: cutout.pcb_cutout_id,
          layer: options.layer, // through-all
          connectivityKey: `cutout:${cutout.pcb_cutout_id}`,
          points: cutout.points,
        } as InputPolygonPad)
      }
    } else if (elm.type === "pcb_via") {
      const via = elm as PcbVia
      if (!via.layers.includes(options.layer)) continue

      let connectivityKey: string | undefined
      if (via.pcb_trace_id) {
        connectivityKey = pcbTraceIdToConnectivityKey[via.pcb_trace_id]
      }

      if (!connectivityKey) {
        connectivityKey = `unconnected-via:${via.pcb_via_id}`
      }

      pads.push({
        shape: "circle",
        padId: via.pcb_via_id,
        layer: options.layer,
        connectivityKey,
        x: via.x,
        y: via.y,
        radius: via.outer_diameter / 2,
      } as InputCircularPad)
    } else if (elm.type === "pcb_trace") {
      const trace = elm as PcbTrace
      if (!trace.source_trace_id) continue
      const connectivityKey = idToConnectivityKey[trace.source_trace_id]
      if (!connectivityKey) continue

      let currentSegmentGroup: Point[] = []
      let currentWidth: number | null = null

      const commitGroup = () => {
        if (currentSegmentGroup.length > 1) {
          pads.push({
            shape: "trace",
            padId: `${trace.pcb_trace_id}-${pads.length}`,
            layer: options.layer,
            connectivityKey,
            segments: currentSegmentGroup,
            width: currentWidth!,
          } as InputTracePad)
        }
        currentSegmentGroup = []
        currentWidth = null
      }

      for (const r of trace.route) {
        const ri = r as any
        const isWireOnLayer =
          ri.route_type === "wire" && ri.layer === options.layer
        if (isWireOnLayer) {
          if (currentWidth === null) currentWidth = ri.width
          currentSegmentGroup.push({ x: ri.x, y: ri.y })
        } else {
          commitGroup()
        }
      }
      commitGroup()
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
      board_edge_margin: options.board_edge_margin ?? 0,
      cutout_margin: options.cutout_margin,
    },
  ]

  return {
    pads,
    regionsForPour,
  }
}
