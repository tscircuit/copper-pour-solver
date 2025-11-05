import { expect, test } from "bun:test"
import circuitJson from "./assets/circuit-3.json"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"
import type { AnyCircuitElement } from "circuit-json"

test("circuit 3", async () => {
  const svg = runSolverAndRenderToSvg(circuitJson as AnyCircuitElement[], {
    layer: "top",
    net_name: "VCC",
    pad_margin: 0.2,
    trace_margin: 0.1,
  })

  await expect(svg).toMatchSvgSnapshot(import.meta.path, "circuit-3")
})
