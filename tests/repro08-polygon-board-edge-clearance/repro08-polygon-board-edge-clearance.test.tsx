import { expect, test } from "bun:test"
import { checkCopperToBoardEdgeClearance } from "@tscircuit/checks"
import { Circuit } from "@tscircuit/core"
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
        text="Expected: GND copper clears the board edge by 0.20 mm"
        pcbY={5}
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
      return convertCircuitJsonToPcbSvg(
        [...solvedCircuitJson, ...clearanceErrors],
        { showErrorsInTextOverlay: true },
      )
    },
  )
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})
