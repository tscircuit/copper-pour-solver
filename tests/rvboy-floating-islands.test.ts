import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputProblem } from "lib/types"
import type { BRepShape } from "circuit-json"
import { processObstaclesForPour } from "lib/solvers/copper-pour/process-obstacles"

const pathFor = (rings: { vertices: { x: number; y: number }[] }[]) =>
  rings
    .map(
      (r) =>
        r.vertices.map((p, i) => `${i ? "L" : "M"}${p.x},${-p.y}`).join(" ") +
        "Z",
    )
    .join(" ")
const render = (input: InputProblem, shapes: BRepShape[]) => {
  const obstacles = processObstaclesForPour(
    input.pads.filter((p) => p.layer === "inner2"),
    undefined,
    { padMargin: 0, traceMargin: 0 },
  ).polygonsToSubtract
  // Crop the render only; solve the exact, complete RVboy input above.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500" viewBox="-29.5 -23.5 32 16"><rect x="-29.5" y="-23.5" width="32" height="16" fill="white"/>${shapes.map((s) => `<path d="${pathFor([s.outer_ring, ...s.inner_rings])}" fill="#d9bc34" fill-rule="evenodd"/>`).join("")}${obstacles.map((p) => `<path d="${pathFor([{ vertices: p }])}" fill="#6b7280"/>`).join("")}</svg>`
}

test("full RVboy pour input removes floating islands and preserves all connected copper", async () => {
  const input: InputProblem = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("./fixtures/rvboy-pour-input.json.gz", import.meta.url),
      ),
    ).toString(),
  )
  const before = new CopperPourPipelineSolver(input).getOutput()
    .brep_shapes_by_region
  expect(before.map((x) => x.length)).toEqual([2, 26])
  for (const region of input.regionsForPour) region.removeFloatingIslands = true
  const after = new CopperPourPipelineSolver(input).getOutput()
    .brep_shapes_by_region
  expect(after.map((x) => x.length)).toEqual([1, 4])
  const ringArea = (r: { vertices: { x: number; y: number }[] }) =>
    Math.abs(
      r.vertices.reduce((sum, p, i) => {
        const q = r.vertices[(i + 1) % r.vertices.length]!
        return sum + p.x * q.y - q.x * p.y
      }, 0) / 2,
    )
  const area = (s: BRepShape) =>
    ringArea(s.outer_ring) -
    s.inner_rings.reduce((sum, r) => sum + ringArea(r), 0)
  // The retained islands preserve their entire physical area, including holes.
  for (const [i, shapes] of after.entries())
    for (const shape of shapes) {
      expect(
        before[i]!.some(
          (original) => Math.abs(area(original) - area(shape)) < 1e-8,
        ),
      ).toBe(true)
    }
  await expect(render(input, before[1]!)).toMatchSvgSnapshot(
    import.meta.path,
    "rvboy-floating-islands-before",
  )
  await expect(render(input, after[1]!)).toMatchSvgSnapshot(
    import.meta.path,
    "rvboy-floating-islands-after",
  )
})
