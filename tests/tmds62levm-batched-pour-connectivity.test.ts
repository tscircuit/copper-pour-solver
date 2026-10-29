import { expect, spyOn, test } from "bun:test"
import { gunzipSync } from "node:zlib"
import type { AnyCircuitElement, SourceNet } from "circuit-json"
import * as connectivity from "circuit-json-to-connectivity-map"
import { convertCircuitJsonToInputProblem } from "../lib/circuit-json/convert-circuit-json-to-input-problem"
import type { ConvertCircuitJsonToInputProblemOptions } from "../lib/circuit-json/ConvertCircuitJsonToInputProblemOptions"

test("prepares TMDS62LEVM connectivity once for a batch of pours", async () => {
  const fixture = Bun.file(
    new URL("./assets/tmds62levm-pour-input.circuit.json.gz", import.meta.url),
  )
  const circuitJson = JSON.parse(
    gunzipSync(await fixture.arrayBuffer()).toString(),
  ) as AnyCircuitElement[]
  const ground = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.name === "DGND",
  )
  const power = circuitJson.find(
    (element): element is SourceNet =>
      element.type === "source_net" && element.name === "VCC_3V3_SYS",
  )
  if (!ground || !power)
    throw new Error("Expected the TMDS62LEVM ground and system power nets")
  const options: ConvertCircuitJsonToInputProblemOptions[] = [
    {
      layer: "top",
      source_net_id: ground.source_net_id,
      pad_margin: 0.254,
      trace_margin: 0.254,
    },
    {
      layer: "top",
      source_net_id: power.source_net_id,
      pad_margin: 0.254,
      trace_margin: 0.254,
    },
    {
      layer: "inner1",
      source_net_id: ground.source_net_id,
      pad_margin: 0.3048,
      trace_margin: 0.3048,
    },
    {
      layer: "bottom",
      source_net_id: ground.source_net_id,
      pad_margin: 0.2032,
      trace_margin: 0.2032,
    },
  ]
  const connectivitySpy = spyOn(
    connectivity,
    "getFullConnectivityMapFromCircuitJson",
  )
  try {
    const startedAt = performance.now()
    const problem = convertCircuitJsonToInputProblem(circuitJson, options)
    console.log(
      `TMDS62LEVM: ${options.length} pours, ${circuitJson.length} elements, ${Math.round(performance.now() - startedAt)}ms`,
    )
    expect(problem.regionsForPour).toHaveLength(4)
    expect(new Set(problem.pads.map((pad) => pad.layer))).toEqual(
      new Set(["top", "inner1", "bottom"]),
    )
    expect(connectivitySpy).toHaveBeenCalledTimes(1)
  } finally {
    connectivitySpy.mockRestore()
  }
}, 120_000)
