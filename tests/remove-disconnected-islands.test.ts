import { expect, test } from "bun:test"
import type { BRepShape } from "circuit-json"
import { CopperPourPipelineSolver } from "lib/index"
import type { InputProblem, InputPourRegion } from "lib/types"

type Point = { x: number; y: number }

const isPointInPolygon = (point: Point, vertices: Point[]) => {
  let isInside = false
  for (
    let vertexIndex = 0, previousVertexIndex = vertices.length - 1;
    vertexIndex < vertices.length;
    previousVertexIndex = vertexIndex++
  ) {
    const vertex = vertices[vertexIndex]!
    const previousVertex = vertices[previousVertexIndex]!
    if (
      vertex.y > point.y !== previousVertex.y > point.y &&
      point.x <
        ((previousVertex.x - vertex.x) * (point.y - vertex.y)) /
          (previousVertex.y - vertex.y) +
          vertex.x
    ) {
      isInside = !isInside
    }
  }
  return isInside
}

const containsPoint = (shapes: BRepShape[], point: Point) =>
  shapes.some(
    (shape) =>
      isPointInPolygon(point, shape.outer_ring.vertices) &&
      !shape.inner_rings.some((ring) => isPointInPolygon(point, ring.vertices)),
  )

const makeRegion = (bounds: InputPourRegion["bounds"]): InputPourRegion => ({
  shape: "rect",
  layer: "top",
  bounds,
  connectivityKey: "net:GND",
  padMargin: 0.2,
  traceMargin: 0.2,
  removeDisconnectedIslands: true,
})

test("removes an island disconnected by exact trace clearance", () => {
  const input: InputProblem = {
    regionsForPour: [makeRegion({ minX: -5, minY: -3, maxX: 5, maxY: 3 })],
    pads: [
      {
        shape: "circle",
        padId: "gnd-pad",
        layer: "top",
        connectivityKey: "net:GND",
        x: -3,
        y: 0,
        radius: 0.4,
      },
      {
        shape: "trace",
        padId: "foreign-trace",
        layer: "top",
        connectivityKey: "net:VBAT",
        width: 0.2,
        segments: [
          { x: 0, y: -4 },
          { x: 0, y: 4 },
        ],
      },
    ],
  }

  const [shapes] = new CopperPourPipelineSolver(input).getOutput()
    .brep_shapes_by_region

  expect(shapes).toHaveLength(1)
  expect(containsPoint(shapes!, { x: -3, y: 0 })).toBe(true)
  expect(containsPoint(shapes!, { x: 3, y: 0 })).toBe(false)
})

test("preserves adjacent same-net implicit regions as one connection", () => {
  const input: InputProblem = {
    regionsForPour: [
      makeRegion({ minX: -5, minY: -3, maxX: 0, maxY: 3 }),
      makeRegion({ minX: 0, minY: -3, maxX: 5, maxY: 3 }),
    ],
    pads: [
      {
        shape: "circle",
        padId: "gnd-pad",
        layer: "top",
        connectivityKey: "net:GND",
        x: -3,
        y: 0,
        radius: 0.4,
      },
    ],
  }

  const [leftShapes, rightShapes] = new CopperPourPipelineSolver(
    input,
  ).getOutput().brep_shapes_by_region

  expect(containsPoint(leftShapes!, { x: -3, y: 0 })).toBe(true)
  expect(containsPoint(rightShapes!, { x: 3, y: 0 })).toBe(true)
})
