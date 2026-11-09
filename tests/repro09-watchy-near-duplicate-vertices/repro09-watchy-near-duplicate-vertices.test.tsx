import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import { getPourPolygon, getSmtPadPolygon } from "@tscircuit/circuit-json-util"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { runSolverAndRenderToSvg } from "../utils/run-solver-and-render-to-svg"

test("Watchy trace clearance leaves a near-duplicate vertex that crashes distance calculations", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      outline={[
        { x: -2.5, y: -9.5 },
        { x: 7, y: -9.5 },
        { x: 7, y: -2.5 },
        { x: -2.5, y: -2.5 },
      ]}
    >
      <net name="GND" isGroundNet />
      <net name="SIGNAL" />
      {/* Keep the coordinates from Watchy's failing trace: rounding hides the defect. */}
      <testpoint
        name="TP1"
        pcbX={4.795609}
        pcbY={-7.454296974643502}
        connections={{ pin1: "net.SIGNAL" }}
        footprint={
          <footprint>
            <smtpad shape="circle" radius={0.05} portHints={["pin1"]} />
          </footprint>
        }
      />
      <testpoint
        name="TP2"
        pcbX={4.795609}
        pcbY={-4.76493975}
        connections={{ pin1: "net.SIGNAL" }}
        footprint={
          <footprint>
            <smtpad shape="circle" radius={0.05} portHints={["pin1"]} />
          </footprint>
        }
      />
      <trace
        from=".TP1 > .pin1"
        to=".TP2 > .pin1"
        thickness={0.15}
        pcbPath={[".TP1 > .pin1", ".TP2 > .pin1"]}
      />
      <pcbnotetext
        text="Watchy trace clearance corner"
        pcbX={2.25}
        pcbY={-3.1}
        fontSize={0.4}
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
        text="Rectangle meets round end cap"
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
        pcbX={2.25}
        pcbY={-8.5}
        fontSize={0.3}
        color="#ffffff"
      />
      <pcbnotetext
        text="Distance calculation"
        pcbX={2.25}
        pcbY={-9}
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
      const pour = solvedCircuitJson.find(
        (element) => element.type === "pcb_copper_pour",
      )!
      const pad = solvedCircuitJson.find(
        (element) => element.type === "pcb_smtpad",
      )!
      const polygon = getPourPolygon(pour)
      const shortestEdge = [...polygon.edges].reduce((shortest, edge) =>
        edge.length < shortest.length ? edge : shortest,
      )
      // Core scales by 1e6 before copperPolygonsTouch calls Flatten's distance code.
      const geometryScale = 1e6
      const scaledEdge = shortestEdge.shape.scale(geometryScale, geometryScale)
      const scaledPad = getSmtPadPolygon(pad).scale(
        geometryScale,
        geometryScale,
      )
      let distanceError: string | undefined
      try {
        scaledEdge.distanceTo(scaledPad)
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
