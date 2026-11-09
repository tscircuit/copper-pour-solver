import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import {
  getPourPolygon,
  getTraceSegmentPolygon,
} from "@tscircuit/circuit-json-util"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { runSolverAndRenderToSvg } from "../utils/run-solver-and-render-to-svg"

test("Watchy trace clearance leaves a near-duplicate vertex that crashes distance calculations", async () => {
  const r1Position = { x: 6.5, y: -9 }
  const circuit = new Circuit()
  circuit.pcbRoutingDisabled = true
  circuit.add(
    <board
      outline={[
        { x: -3, y: -11 },
        { x: 9, y: -11 },
        { x: 9, y: -1 },
        { x: -3, y: -1 },
      ]}
    >
      <net name="GND" isGroundNet />
      <net name="SIGNAL" />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        pcbX={r1Position.x}
        pcbY={r1Position.y}
        connections={{ pin1: "net.SIGNAL", pin2: "net.GND" }}
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0603"
        pcbX={4.795609}
        pcbY={-3.4}
        connections={{ pin1: "net.SIGNAL", pin2: "net.GND" }}
      />
      {/* Preserve Watchy's corner in board coordinates; pcbPath is relative to R1. */}
      <trace
        from=".R1 > .pin1"
        to=".R2 > .pin1"
        thickness={0.15}
        pcbPathRelativeTo=".R1 > .pin1"
        pcbPath={[
          ".R1 > .pin1",
          { x: 4.795609 - r1Position.x, y: -7.454296974643502 - r1Position.y },
          { x: 4.795609 - r1Position.x, y: -4.76493975 - r1Position.y },
          ".R2 > .pin1",
        ]}
      />
      <pcbnotetext
        text="Watchy trace clearance corner"
        pcbX={3}
        pcbY={-1.7}
        fontSize={0.4}
        color="#ffffff"
      />
      <pcbnotetext
        text="GND copper pour"
        pcbX={0}
        pcbY={-3.7}
        fontSize={0.3}
        color="#ffffff"
      />
      <pcbnotetext
        text="Trace width: 0.15 mm"
        pcbX={0}
        pcbY={-4.5}
        fontSize={0.3}
        color="#ffffff"
      />
      <pcbnotetext
        text="Pour clearance: 0.2032 mm"
        pcbX={0}
        pcbY={-5.2}
        fontSize={0.3}
        color="#ffffff"
      />
      <pcbnotetext
        text="Duplicate vertices at this corner"
        pcbX={0.3}
        pcbY={-6.5}
        fontSize={0.28}
        color="#ffffff"
      />
      <pcbnoteline
        x1={1.2}
        y1={-6.9}
        x2={4.517409}
        y2={-7.454296974643502}
        strokeWidth={0.03}
        color="#ffffff"
      />
      <pcbnotetext
        text="Shortest pour edge"
        pcbX={3}
        pcbY={-10}
        fontSize={0.3}
        color="#ffffff"
      />
      <pcbnotetext
        text="Distance calculation"
        pcbX={3}
        pcbY={-10.5}
        fontSize={0.3}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const svg = runSolverAndRenderToSvg(
    circuit.getCircuitJson(),
    {
      layer: "top",
      net_name: "GND",
      pad_margin: 0.2032,
      trace_margin: 0.2032,
      board_edge_margin: 0.3,
    },
    (solvedCircuitJson) => {
      const pourEdges = solvedCircuitJson
        .filter((element) => element.type === "pcb_copper_pour")
        .flatMap((pour) => [...getPourPolygon(pour).edges])
      const trace = solvedCircuitJson.find(
        (element) => element.type === "pcb_trace",
      )!
      const wirePoints = trace.route.filter(
        (point) => point.route_type === "wire",
      )
      const start = wirePoints[0]!
      const end = wirePoints.find(
        (point) => point.x !== start.x || point.y !== start.y,
      )!
      const shortestEdge = pourEdges.reduce((shortest, edge) =>
        edge.length < shortest.length ? edge : shortest,
      )
      // Core scales by 1e6 before copperPolygonsTouch calls Flatten's distance code.
      const geometryScale = 1e6
      const scaledEdge = shortestEdge.shape.scale(geometryScale, geometryScale)
      const scaledTrace = getTraceSegmentPolygon(start, end, start.width).scale(
        geometryScale,
        geometryScale,
      )
      let distanceError: string | undefined
      try {
        scaledEdge.distanceTo(scaledTrace)
      } catch (error) {
        if (!(error instanceof Error)) throw error
        distanceError = error.message
      }

      expect(shortestEdge.length).toBe(7.105427357601002e-15)
      expect(distanceError).toBe("Illegal Parameters")

      const labeledCircuitJson = solvedCircuitJson.map((element) => {
        if (element.type !== "pcb_note_text") return element
        if (element.text === "Shortest pour edge") {
          return {
            ...element,
            text: `Shortest pour edge: ${shortestEdge.length.toExponential(3)} mm`,
          }
        }
        if (element.text === "Distance calculation") {
          return {
            ...element,
            text: `Distance calculation: ${distanceError ?? "OK"}`,
            color: distanceError ? "#ff4444" : "#44ff88",
          }
        }
        return element
      })
      return convertCircuitJsonToPcbSvg(labeledCircuitJson)
    },
  )
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
