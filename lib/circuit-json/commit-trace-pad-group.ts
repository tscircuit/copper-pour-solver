import type { LayerRef, PcbTrace, Point } from "circuit-json"
import type { InputPad } from "lib/types"

export interface TracePadGroup {
  points: Point[]
  width: number | null
}

export function commitTracePadGroup(
  {
    trace,
    pads,
    layer,
    connectivityKey,
  }: {
    trace: PcbTrace
    pads: InputPad[]
    layer: LayerRef
    connectivityKey: string
  },
  group: TracePadGroup,
): void {
  if (group.points.length > 1 && group.width !== null) {
    pads.push({
      shape: "trace",
      padId: `${trace.pcb_trace_id}-${pads.length}`,
      layer,
      connectivityKey,
      segments: group.points,
      width: group.width,
    })
  }
  group.points = []
  group.width = null
}
