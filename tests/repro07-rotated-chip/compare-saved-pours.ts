import type {
  AnyCircuitElement,
  BRepShape,
  PcbCopperPourBRep,
  Point,
} from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
  initializeManifoldGeometry,
} from "lib/index"

// Run manually with the downloaded, decompressed AM3352 circuit JSON.
const path = process.argv[2]
if (!path)
  throw new Error(
    "Usage: bun tests/repro07-rotated-chip/compare-saved-pours.ts <circuit.json>",
  )
const circuitJson: AnyCircuitElement[] = await Bun.file(path).json()
const saved = circuitJson.find(
  (e): e is PcbCopperPourBRep =>
    e.type === "pcb_copper_pour" &&
    e.shape === "brep" &&
    e.pcb_copper_pour_id === "reuse_pcb_copper_pour_133_0",
)
if (!saved) throw new Error("Expected the reported DDR_1V5 top-layer pour")
await initializeManifoldGeometry()
const input = convertCircuitJsonToInputProblem(circuitJson, {
  layer: "top",
  source_net_id: saved.source_net_id,
  outline: saved.brep_shape.outer_ring.vertices,
  pad_margin: 0.2,
  trace_margin: 0.2,
})
const fresh = new CopperPourPipelineSolver(input).getOutput().brep_shapes
const insideRing = (p: Point, vertices: Point[]) => {
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]!,
      b = vertices[j]!
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside
  }
  return inside
}
const containsCopper = (p: Point, shapes: BRepShape[]) =>
  shapes.some(
    (s) =>
      insideRing(p, s.outer_ring.vertices) &&
      !s.inner_rings.some((r) => insideRing(p, r.vertices)),
  )
console.table(
  [
    { x: -12.6, y: -28.5 },
    { x: -12.8, y: -29 },
    { x: -10, y: -34 },
    { x: -11, y: -34 },
  ].map((p) => ({
    ...p,
    savedCopper: containsCopper(p, [saved.brep_shape]),
    freshCopper: containsCopper(p, fresh),
  })),
)
