import type { InputPillPad } from "lib/types"
import { getPillAxisRotation, rotatedBoxToPolygon } from "./polygon-primitives"
import { MANIFOLD_GEOMETRY_SCALE, type PolygonRing } from "./polygon-ring"

export const bridgePillPadClearances = (
  pads: InputPillPad[],
  pourConnectivityKey: string,
  margin: number,
): PolygonRing[] => {
  const rowsByFootprintAndAxis = new Map<
    string,
    { axis: number; pads: InputPillPad[] }
  >()
  for (const pad of pads) {
    if (!pad.isSmtPad || !pad.pcbComponentId) continue
    const rotation = getPillAxisRotation(pad.width, pad.height, pad.ccwRotation)
    const axis = ((rotation % 180) + 180) % 180
    const key = `${axis}:${pad.pcbComponentId}`
    const group = rowsByFootprintAndAxis.get(key) ?? { axis, pads: [] }
    group.pads.push(pad)
    rowsByFootprintAndAxis.set(key, group)
  }

  const bridges: PolygonRing[] = []
  for (const { axis, pads: alignedPads } of rowsByFootprintAndAxis.values()) {
    const angle = (axis * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const orderedPads = alignedPads
      .map((pad) => ({
        pad,
        along: pad.x * cos + pad.y * sin,
        across: -pad.x * sin + pad.y * cos,
      }))
      .sort((a, b) => a.across - b.across)

    for (const [index, current] of orderedPads.entries()) {
      const { pad } = current
      const length = Math.max(pad.width, pad.height)
      if (
        pad.connectivityKey === pourConnectivityKey ||
        length <= 2 * pad.radius
      ) {
        continue
      }

      const clearanceDiameter = 2 * (pad.radius + margin)
      for (let next = index + 1; next < orderedPads.length; next++) {
        const candidate = orderedPads[next]!
        const pitch = candidate.across - current.across
        if (pitch >= clearanceDiameter) break
        if (
          Math.abs(candidate.along - current.along) >
          1 / MANIFOLD_GEOMETRY_SCALE
        ) {
          continue
        }

        // Only bridge consecutive pads in a row. A same-net pad must stop
        // the search even though it has no clearance of its own.
        const neighbor = candidate.pad
        if (
          neighbor.connectivityKey !== pourConnectivityKey &&
          neighbor.radius === pad.radius &&
          Math.max(neighbor.width, neighbor.height) === length &&
          pitch > 2 * pad.radius
        ) {
          // Together with the two capsules, this rectangle forms their convex
          // hull. The added area removes the teeth at the overlapping end caps.
          bridges.push(
            rotatedBoxToPolygon(
              { x: (pad.x + neighbor.x) / 2, y: (pad.y + neighbor.y) / 2 },
              length + 2 * margin,
              pitch,
              axis,
            ),
          )
        }
        break
      }
    }
  }

  return bridges
}
