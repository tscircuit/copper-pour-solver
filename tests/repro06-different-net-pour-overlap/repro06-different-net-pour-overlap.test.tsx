import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import type { AnyCircuitElement, BRepShape, SourceNet } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { runSolverAndRenderToSvg } from "../utils/run-solver-and-render-to-svg"

type Point = { x: number; y: number }

const aisenPourOutline = [
  { x: -2, y: -2 },
  { x: 2, y: -2 },
  { x: 2, y: 2 },
  { x: -2, y: 2 },
  { x: -2, y: -2 },
]

const DifferentNetPourOverlapRepro = () => (
  <board width="20mm" height="12mm">
    <net name="GND" isGroundNet />
    <net name="AISEN" />

    <copperpour
      name="GND_BOTTOM"
      layer="bottom"
      connectsTo="net.GND"
      clearance="0.2mm"
    />
    <copperpour
      name="AISEN_BOTTOM"
      layer="bottom"
      connectsTo="net.AISEN"
      clearance="0.2mm"
      outline={aisenPourOutline}
    />

    <pcbnotetext
      text="BUG: GND and AISEN pours overlap at center"
      pcbY={4.8}
      fontSize="0.35mm"
      color="#ffffff"
    />
  </board>
)

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

const solvePour = (
  circuitJson: AnyCircuitElement[],
  netName: string,
  outline?: Point[],
) => {
  const sourceNet = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.name === netName,
  )

  if (!sourceNet) throw new Error(`Source net "${netName}" not found`)

  const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "bottom",
    source_net_id: sourceNet.source_net_id,
    pad_margin: 0.2,
    trace_margin: 0.2,
    board_edge_margin: 0.2,
    outline,
  })

  return new CopperPourPipelineSolver(inputProblem).getOutput().brep_shapes
}

test.failing("different-net copper pours on the same layer should not overlap", async () => {
  const circuit = new Circuit()
  circuit.add(<DifferentNetPourOverlapRepro />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit
    .getCircuitJson()
    .filter(
      (element) => element.type !== "pcb_copper_pour",
    ) as AnyCircuitElement[]

  const brepShapes = [
    ...solvePour(circuitJson, "GND"),
    ...solvePour(circuitJson, "AISEN", aisenPourOutline),
  ]
  const poursContainingBoardCenter = brepShapes.filter((brepShape) =>
    isPointInBrepShape({ x: 0, y: 0 }, brepShape),
  )

  const svg = runSolverAndRenderToSvg(circuitJson, [
    {
      layer: "bottom",
      net_name: "GND",
      pad_margin: 0.2,
      trace_margin: 0.2,
      board_edge_margin: 0.2,
    },
    {
      layer: "bottom",
      net_name: "AISEN",
      pad_margin: 0.2,
      trace_margin: 0.2,
      board_edge_margin: 0.2,
      outline: aisenPourOutline,
    },
  ])

  await expect(svg).toMatchSvgSnapshot(
    import.meta.path,
    "repro06-different-net-pour-overlap",
  )
  expect(brepShapes).toHaveLength(2)
  expect(poursContainingBoardCenter.length).toBeLessThanOrEqual(1)
})
