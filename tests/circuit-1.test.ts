import { expect, test } from "bun:test"
import circuitJson from "./assets/circuit-1.json"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("circuit-1", async () => {
  const svg = runSolverAndRenderToSvg(circuitJson as any, {
    layer: "top",
    net_name: "GND",
    pad_margin: 0.4,
    trace_margin: 0.2,
  })

  await expect(svg).toMatchSvgSnapshot(import.meta.path, "circuit-1")
})
