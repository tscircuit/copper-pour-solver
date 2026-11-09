import { expect, test } from "bun:test"
import { checkCopperToBoardEdgeClearance } from "@tscircuit/checks"
import { Circuit } from "@tscircuit/core"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { runSolverAndRenderToSvg } from "../utils/run-solver-and-render-to-svg"

test("polygon board copper pour respects the requested edge clearance", async () => {
  const radius = 15
  const outline = Array.from({ length: 49 }, (_, i) => {
    const angle = ((-60 + (300 * i) / 48) * Math.PI) / 180
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
  })
  const circuit = new Circuit()
  circuit.add(
    <board outline={outline}>
      <resistor name="R1" resistance="1k" footprint="0603" />
      <trace from=".R1 > .pin1" to="net.GND" />
      <trace from=".R1 > .pin2" to="net.GND" />
      <pcbnotetext
        text="Required edge clearance: 0.200000000000 mm"
        pcbY={5}
        fontSize={0.6}
        color="#ffffff"
      />
      <pcbnotetext
        text="Measured edge clearance"
        pcbY={3}
        fontSize={0.6}
        color="#ffffff"
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const svg = runSolverAndRenderToSvg(
    circuit.getCircuitJson(),
    {
      layer: "top",
      net_name: "GND",
      pad_margin: 0.2,
      trace_margin: 0.2,
      board_edge_margin: 0.2,
    },
    (solvedCircuitJson) => {
      const clearanceErrors = checkCopperToBoardEdgeClearance(solvedCircuitJson)
      expect(clearanceErrors).toHaveLength(1)
      const pour = solvedCircuitJson.find(
        (element) => element.type === "pcb_copper_pour",
      )
      if (!pour || pour.shape !== "brep") {
        throw new Error("Expected a boundary-representation copper pour")
      }
      const minimumClearance = Math.min(
        ...pour.brep_shape.outer_ring.vertices.flatMap((vertex) =>
          outline.map((start, index) =>
            pointToSegmentDistance(
              vertex,
              start,
              outline[(index + 1) % outline.length]!,
            ),
          ),
        ),
      )
      expect(minimumClearance).toBeCloseTo(0.19999892247629383, 12)
      expect(minimumClearance).toBeLessThan(0.2 - 1e-9)
      const labeledCircuitJson = solvedCircuitJson.map((element) =>
        element.type === "pcb_note_text" &&
        element.text === "Measured edge clearance"
          ? {
              ...element,
              text: `Measured edge clearance: ${minimumClearance.toFixed(12)} mm`,
            }
          : element,
      )
      return convertCircuitJsonToPcbSvg(
        [...labeledCircuitJson, ...clearanceErrors],
        { showErrorsInTextOverlay: true },
      )
    },
  )
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
