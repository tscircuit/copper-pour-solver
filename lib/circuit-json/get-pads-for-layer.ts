import type {
  LayerRef,
  PCBKeepout,
  PcbPlatedHole,
  PcbSmtPad,
  PcbTrace,
  PcbVia,
} from "circuit-json"
import type {
  InputCircularPad,
  InputOvalPad,
  InputPad,
  InputPillPad,
  InputPolygonPad,
  InputRectPad,
  InputRotatedRectPad,
} from "lib/types"
import {
  commitTracePadGroup,
  type TracePadGroup,
} from "./commit-trace-pad-group"
import type { CircuitJsonPourContext } from "./CircuitJsonPourContext"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"

export function getPadsForLayer(
  { layer }: { layer: LayerRef },
  context: CircuitJsonPourContext,
): InputPad[] {
  const cachedPads = context.padsByLayer.get(layer)
  if (cachedPads) return cachedPads
  const { circuitJson, subcircuitConnectivityMap } = context
  const { getSubcircuitConnectivityKeyForId } = subcircuitConnectivityMap
  const pads: InputPad[] = []

  for (const elm of circuitJson) {
    if (elm.type === "pcb_smtpad") {
      const smtpad = elm as PcbSmtPad
      if (smtpad.layer !== layer) continue

      let connectivityKey: string | undefined
      connectivityKey = getSubcircuitConnectivityKeyForId(smtpad.pcb_smtpad_id)
      if (!connectivityKey) {
        connectivityKey = `unconnected:${smtpad.pcb_smtpad_id}`
      }

      if (smtpad.shape === "rect") {
        pads.push({
          shape: "rect",
          padId: smtpad.pcb_smtpad_id,
          layer: smtpad.layer,
          connectivityKey,
          isSmtPad: true,
          bounds: {
            minX: smtpad.x - smtpad.width! / 2,
            minY: smtpad.y - smtpad.height! / 2,
            maxX: smtpad.x + smtpad.width! / 2,
            maxY: smtpad.y + smtpad.height! / 2,
          },
        } as InputRectPad)
      } else if (smtpad.shape === "rotated_rect") {
        pads.push({
          shape: "rotated_rect",
          padId: smtpad.pcb_smtpad_id,
          layer: smtpad.layer,
          connectivityKey,
          isSmtPad: true,
          x: smtpad.x,
          y: smtpad.y,
          width: smtpad.width,
          height: smtpad.height,
          ccwRotation: smtpad.ccw_rotation,
        } as InputRotatedRectPad)
      } else if (smtpad.shape === "circle") {
        pads.push({
          shape: "circle",
          padId: smtpad.pcb_smtpad_id,
          layer: smtpad.layer,
          connectivityKey,
          isSmtPad: true,
          x: smtpad.x,
          y: smtpad.y,
          radius: smtpad.radius!,
        } as InputCircularPad)
      } else if (smtpad.shape === "pill" || smtpad.shape === "rotated_pill") {
        pads.push({
          shape: "pill",
          padId: smtpad.pcb_smtpad_id,
          layer: smtpad.layer,
          connectivityKey,
          isSmtPad: true,
          x: smtpad.x,
          y: smtpad.y,
          width: smtpad.width!,
          height: smtpad.height!,
          radius: smtpad.radius!,
          ccwRotation:
            smtpad.shape === "rotated_pill" ? smtpad.ccw_rotation : 0,
        } as InputPillPad)
      } else if (smtpad.shape === "polygon") {
        pads.push({
          shape: "polygon",
          padId: smtpad.pcb_smtpad_id,
          layer: smtpad.layer,
          connectivityKey,
          isSmtPad: true,
          points: smtpad.points,
        } as InputPolygonPad)
      }
    } else if (elm.type === "pcb_plated_hole") {
      const platedHole = elm as PcbPlatedHole
      if (!platedHole.layers.includes(layer)) continue

      let connectivityKey = getSubcircuitConnectivityKeyForId(
        platedHole.pcb_plated_hole_id,
      )
      if (!connectivityKey) {
        connectivityKey = `unconnected-plated-hole:${platedHole.pcb_plated_hole_id}`
      }

      if (platedHole.shape === "hole_with_polygon_pad") {
        const holeLocalToBoardTransform = compose(
          translate(platedHole.x, platedHole.y),
          rotateDEG(platedHole.ccw_rotation ?? 0),
        )
        pads.push({
          shape: "polygon",
          padId: platedHole.pcb_plated_hole_id,
          layer,
          connectivityKey,
          isPlatedHole: true,
          points: platedHole.pad_outline.map((vertex) =>
            applyToPoint(holeLocalToBoardTransform, vertex),
          ),
        })
      } else if (platedHole.shape === "circle") {
        pads.push({
          shape: "circle",
          padId: platedHole.pcb_plated_hole_id,
          layer,
          connectivityKey,
          isPlatedHole: true,
          x: platedHole.x,
          y: platedHole.y,
          radius: platedHole.outer_diameter / 2,
        } as InputCircularPad)
      } else if (platedHole.shape === "pill") {
        pads.push({
          shape: "pill",
          padId: platedHole.pcb_plated_hole_id,
          layer,
          connectivityKey,
          isPlatedHole: true,
          x: platedHole.x,
          y: platedHole.y,
          width: platedHole.outer_width,
          height: platedHole.outer_height,
          radius: Math.min(platedHole.outer_width, platedHole.outer_height) / 2,
          ccwRotation: platedHole.ccw_rotation,
        } as InputPillPad)
      } else if (platedHole.shape === "oval") {
        pads.push({
          shape: "oval",
          padId: platedHole.pcb_plated_hole_id,
          layer,
          connectivityKey,
          isPlatedHole: true,
          x: platedHole.x,
          y: platedHole.y,
          width: platedHole.outer_width,
          height: platedHole.outer_height,
          ccwRotation: platedHole.ccw_rotation,
        } as InputOvalPad)
      } else if (
        platedHole.shape === "circular_hole_with_rect_pad" ||
        platedHole.shape === "pill_hole_with_rect_pad" ||
        platedHole.shape === "rotated_pill_hole_with_rect_pad"
      ) {
        const rectWidth = platedHole.rect_pad_width
        const rectHeight = platedHole.rect_pad_height
        if (typeof rectWidth !== "number" || typeof rectHeight !== "number") {
          continue
        }
        const rectRotation =
          platedHole.shape === "pill_hole_with_rect_pad"
            ? 0
            : (platedHole.rect_ccw_rotation ?? 0)
        if (rectRotation === 0) {
          pads.push({
            shape: "rect",
            padId: platedHole.pcb_plated_hole_id,
            layer,
            connectivityKey,
            isPlatedHole: true,
            bounds: {
              minX: platedHole.x - rectWidth / 2,
              minY: platedHole.y - rectHeight / 2,
              maxX: platedHole.x + rectWidth / 2,
              maxY: platedHole.y + rectHeight / 2,
            },
          } as InputRectPad)
        } else {
          pads.push({
            shape: "rotated_rect",
            padId: platedHole.pcb_plated_hole_id,
            layer,
            connectivityKey,
            isPlatedHole: true,
            x: platedHole.x,
            y: platedHole.y,
            width: rectWidth,
            height: rectHeight,
            ccwRotation: rectRotation,
          } as InputRotatedRectPad)
        }
      }
    } else if (elm.type === "pcb_hole") {
      const hole = elm
      if (hole.hole_shape === "rect") {
        pads.push({
          shape: "rect",
          padId: hole.pcb_hole_id,
          layer,
          connectivityKey: `hole:${hole.pcb_hole_id}`,
          bounds: {
            minX: hole.x - hole.hole_width / 2,
            minY: hole.y - hole.hole_height / 2,
            maxX: hole.x + hole.hole_width / 2,
            maxY: hole.y + hole.hole_height / 2,
          },
        })
        continue
      }
      if (hole.hole_shape === "pill" || hole.hole_shape === "rotated_pill") {
        let ccwRotation = 0
        if (hole.hole_shape === "rotated_pill") ccwRotation = hole.ccw_rotation
        pads.push({
          shape: "pill",
          padId: hole.pcb_hole_id,
          layer,
          connectivityKey: `hole:${hole.pcb_hole_id}`,
          x: hole.x,
          y: hole.y,
          width: hole.hole_width,
          height: hole.hole_height,
          radius: Math.min(hole.hole_width, hole.hole_height) / 2,
          ccwRotation,
        })
        continue
      }
      if (hole.hole_shape === "oval") {
        pads.push({
          shape: "oval",
          padId: hole.pcb_hole_id,
          layer,
          connectivityKey: `hole:${hole.pcb_hole_id}`,
          x: hole.x,
          y: hole.y,
          width: hole.hole_width,
          height: hole.hole_height,
          ccwRotation: 0,
        })
        continue
      }
      if (hole.hole_shape !== "circle") continue

      pads.push({
        shape: "circle",
        padId: hole.pcb_hole_id,
        layer, // holes are through-all
        connectivityKey: `hole:${hole.pcb_hole_id}`,
        x: hole.x,
        y: hole.y,
        radius: hole.hole_diameter / 2,
      } as InputCircularPad)
    } else if (elm.type === "pcb_cutout") {
      const cutout = elm
      if (cutout.shape === "rect") {
        if (cutout.rotation) {
          pads.push({
            shape: "rotated_rect",
            padId: cutout.pcb_cutout_id,
            layer,
            connectivityKey: `cutout:${cutout.pcb_cutout_id}`,
            x: cutout.center.x,
            y: cutout.center.y,
            width: cutout.width,
            height: cutout.height,
            ccwRotation: cutout.rotation,
          })
          continue
        }
        pads.push({
          shape: "rect",
          padId: cutout.pcb_cutout_id,
          layer, // through-all
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
          layer, // through-all
          connectivityKey: `cutout:${cutout.pcb_cutout_id}`,
          x: cutout.center.x,
          y: cutout.center.y,
          radius: cutout.radius,
        } as InputCircularPad)
      } else if (cutout.shape === "polygon") {
        pads.push({
          shape: "polygon",
          padId: cutout.pcb_cutout_id,
          layer, // through-all
          connectivityKey: `cutout:${cutout.pcb_cutout_id}`,
          points: cutout.points,
        } as InputPolygonPad)
      }
    } else if (elm.type === "pcb_keepout") {
      const keepout = elm as PCBKeepout
      if (!keepout.layers.includes(layer)) continue

      if (keepout.shape === "rect") {
        pads.push({
          shape: "rect",
          padId: keepout.pcb_keepout_id,
          layer,
          connectivityKey: `keepout:${keepout.pcb_keepout_id}`,
          bounds: {
            minX: keepout.center.x - keepout.width / 2,
            minY: keepout.center.y - keepout.height / 2,
            maxX: keepout.center.x + keepout.width / 2,
            maxY: keepout.center.y + keepout.height / 2,
          },
        } as InputRectPad)
      } else if (keepout.shape === "circle") {
        pads.push({
          shape: "circle",
          padId: keepout.pcb_keepout_id,
          layer,
          connectivityKey: `keepout:${keepout.pcb_keepout_id}`,
          x: keepout.center.x,
          y: keepout.center.y,
          radius: keepout.radius,
        } as InputCircularPad)
      }
    } else if (elm.type === "pcb_via") {
      const via = elm as PcbVia
      if (!via.layers.includes(layer)) continue

      const connectivityKey: string =
        getSubcircuitConnectivityKeyForId(via.pcb_via_id) ??
        `unconnected-via:${via.pcb_via_id}`

      pads.push({
        shape: "circle",
        padId: via.pcb_via_id,
        layer,
        connectivityKey,
        x: via.x,
        y: via.y,
        radius: via.outer_diameter / 2,
      } as InputCircularPad)
    } else if (elm.type === "pcb_trace") {
      const trace = elm as PcbTrace
      const connectivityKey =
        getSubcircuitConnectivityKeyForId(trace.pcb_trace_id) ??
        `unconnected-trace:${trace.pcb_trace_id}`

      const group: TracePadGroup = { points: [], width: null }
      const traceContext = { trace, pads, layer, connectivityKey }

      for (const [index, ri] of trace.route.entries()) {
        const next = trace.route[index + 1]
        if (
          ri.route_type === "wire" &&
          ri.layer === layer &&
          ri.width_interpolation_mode &&
          ri.start_width !== undefined &&
          ri.end_width !== undefined &&
          next
        ) {
          const end = next.route_type === "through_pad" ? next.start : next
          let endLayer: LayerRef | undefined
          if (next.route_type === "via") endLayer = next.from_layer
          else if (next.route_type === "through_pad")
            endLayer = next.start_layer
          else endLayer = next.layer
          if (
            endLayer === ri.layer &&
            Math.hypot(end.x - ri.x, end.y - ri.y) > 0
          ) {
            // End the preceding constant-width run at this point, then emit
            // the taper independently. Its endpoint begins the next run.
            group.points.push({ x: ri.x, y: ri.y })
            commitTracePadGroup(traceContext, group)
            pads.push({
              shape: "tapered_trace",
              padId: `${trace.pcb_trace_id}-${pads.length}`,
              layer,
              connectivityKey,
              start: { x: ri.x, y: ri.y },
              end: { x: end.x, y: end.y },
              start_width: ri.start_width,
              end_width: ri.end_width,
              width_interpolation_mode: ri.width_interpolation_mode,
            })
            continue
          }
        }
        const isWireOnLayer = ri.route_type === "wire" && ri.layer === layer
        if (isWireOnLayer) {
          const point = { x: ri.x, y: ri.y }

          if (group.width === null) {
            group.width = ri.width
          } else if (ri.width !== group.width) {
            group.points.push(point)
            commitTracePadGroup(traceContext, group)
            group.width = ri.width
          }

          group.points.push(point)
        } else {
          commitTracePadGroup(traceContext, group)
        }
      }
      commitTracePadGroup(traceContext, group)
    }
  }

  context.padsByLayer.set(layer, pads)
  return pads
}
