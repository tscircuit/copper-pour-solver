import { expect, spyOn, test } from "bun:test"
import { gunzipSync } from "node:zlib"
import type { AnyCircuitElement } from "circuit-json"
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import { getCrossSection } from "lib/solvers/copper-pour/manifold-runtime"

test("releases native TMDS62LEVM geometry after serializing the pour output", async () => {
  const fixture = Bun.file(
    new URL("./assets/tmds62levm-pour-input.circuit.json.gz", import.meta.url),
  )
  const circuitJson = JSON.parse(
    gunzipSync(await fixture.arrayBuffer()).toString(),
  ) as AnyCircuitElement[]
  const problem = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "top",
    source_net_name: "DGND",
    pad_margin: 0.254,
    trace_margin: 0.254,
  })
  const CrossSection = getCrossSection()
  const constructors = spyOn(CrossSection, "ofPolygons")
  const deletions = spyOn(CrossSection.prototype, "delete")
  try {
    const output = new CopperPourPipelineSolver(problem).getOutput()
    expect(output.brep_shapes.length).toBeGreaterThan(0)
    const createdSections = constructors.mock.results.flatMap((result) =>
      result.type === "return" ? [result.value] : [],
    )
    expect(createdSections.length).toBeGreaterThan(0)
    expect(
      createdSections.every((section) =>
        deletions.mock.contexts.includes(section),
      ),
    ).toBe(true)
  } finally {
    for (const result of constructors.mock.results) {
      if (
        result.type === "return" &&
        !deletions.mock.contexts.includes(result.value)
      )
        result.value.delete()
    }
    constructors.mockRestore()
    deletions.mockRestore()
  }
}, 120_000)
