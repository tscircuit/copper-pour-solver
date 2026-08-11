import { expect, test } from "bun:test"
import type { BRepShape } from "circuit-json"
import { CopperPourPipelineSolver } from "lib/index"

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

const isPointInBrepShape = (point: Point, brepShape: BRepShape) =>
  isPointInPolygon(point, brepShape.outer_ring.vertices) &&
  !brepShape.inner_rings.some((innerRing) =>
    isPointInPolygon(point, innerRing.vertices),
  )

test.failing("different-net copper pours on the same layer should not overlap", () => {
  const output = new CopperPourPipelineSolver({
    regionsForPour: [
      {
        shape: "rect",
        layer: "bottom",
        bounds: { minX: -10, minY: -6, maxX: 10, maxY: 6 },
        connectivityKey: "net:GND",
        padMargin: 0.2,
        traceMargin: 0.2,
        board_edge_margin: 0.2,
      },
      {
        shape: "rect",
        layer: "bottom",
        bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
        connectivityKey: "net:AISEN",
        padMargin: 0.2,
        traceMargin: 0.2,
        board_edge_margin: 0.2,
      },
    ],
    pads: [],
  }).getOutput()

  const poursContainingBoardCenter = output.brep_shapes.filter((brepShape) =>
    isPointInBrepShape({ x: 0, y: 0 }, brepShape),
  )

  expect(output.brep_shapes).toHaveLength(2)
  expect(poursContainingBoardCenter.length).toBeLessThanOrEqual(1)
})
