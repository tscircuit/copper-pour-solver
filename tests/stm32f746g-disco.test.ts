import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import circuitJson from "./assets/tsci_AnasSarkiz.STM32F746G-DISCO.circuit.json"
import { runSolverAndRenderToSvg } from "./utils/run-solver-and-render-to-svg"

test("stm32f746g-disco top layer full board repro", () => {
  expect(() =>
    runSolverAndRenderToSvg(circuitJson as AnyCircuitElement[], {
      layer: "top",
      net_name: "GND",
      pad_margin: 0.2,
      trace_margin: 0.2,
    }),
  ).toThrowErrorMatchingInlineSnapshot(`"Cannot complete boolean operation"`)
})

test("stm32f746g-disco bottom layer full board repro", () => {
  expect(() =>
    runSolverAndRenderToSvg(circuitJson as AnyCircuitElement[], {
      layer: "bottom",
      net_name: "GND",
      pad_margin: 0.2,
      trace_margin: 0.2,
    }),
  ).toThrowErrorMatchingInlineSnapshot(`"Cannot complete boolean operation"`)
})
