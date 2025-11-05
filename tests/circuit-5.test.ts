import { expect, test } from "bun:test"
import circuitJson from "./assets/circuit-5.json"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"
import type { AnyCircuitElement } from "circuit-json"

test("circuit 5", async () => {
  const svg = runSolverAndRenderToSvg(circuitJson as AnyCircuitElement[], {
    layer: "bottom",
    net_name: "VCC",
    pad_margin: 0.4,
    trace_margin: 0.2,
  })

  await expect(svg).toMatchSvgSnapshot(import.meta.path, "circuit-5")
})
