import { expect, test } from "bun:test"
import type { AnyCircuitElement, LayerRef } from "circuit-json"
import { runSolverAndRenderToSvg } from "../utils/run-solver-and-render-to-svg"
import circuitJson from "./rp2040-motor-controller.circuit.json"

const motorControllerCircuitJson = circuitJson as AnyCircuitElement[]

const renderLayer = (layer: LayerRef) =>
  runSolverAndRenderToSvg(motorControllerCircuitJson, {
    layer,
    net_name: "GND",
    pad_margin: 0.2,
    trace_margin: 0.2,
    board_edge_margin: 0.3,
  })

test("repro04 rp2040 motor controller top layer", async () => {
  const svg = renderLayer("top")

  await expect(svg).toMatchSvgSnapshot(
    import.meta.path,
    "repro04-rp2040-motor-controller-top",
  )
})

test("repro04 rp2040 motor controller bottom layer", async () => {
  const svg = renderLayer("bottom")

  await expect(svg).toMatchSvgSnapshot(
    import.meta.path,
    "repro04-rp2040-motor-controller-bottom",
  )
})
