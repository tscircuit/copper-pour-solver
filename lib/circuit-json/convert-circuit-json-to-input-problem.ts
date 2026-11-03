import type { AnyCircuitElement, PcbBoard } from "circuit-json"
import { getFullConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { InputPad, InputProblem } from "lib/types"
import { buildSubcircuitConnectivityLookup } from "./buildSubcircuitConnectivityLookup"
import type { ConvertCircuitJsonToInputProblemOptions } from "./ConvertCircuitJsonToInputProblemOptions"
import { convertSingleCopperPourToInputProblem } from "./convert-single-copper-pour-to-input-problem"

type CopperPadLayerKey = `${InputPad["layer"]}:${InputPad["padId"]}`

export const convertCircuitJsonToInputProblem = (
  circuitJson: AnyCircuitElement[],
  optionsOrOptions:
    | ConvertCircuitJsonToInputProblemOptions
    | ConvertCircuitJsonToInputProblemOptions[],
): InputProblem => {
  const optionsList = Array.isArray(optionsOrOptions)
    ? optionsOrOptions
    : [optionsOrOptions]
  if (optionsList.length === 0) return { pads: [], regionsForPour: [] }
  const subcircuitId = optionsList[0]!.subcircuit_id
  if (optionsList.some((options) => options.subcircuit_id !== subcircuitId))
    throw new Error(
      "All copper pours in one input problem must use the same subcircuit_id",
    )
  const pcbBoard = circuitJson.find(
    (element): element is PcbBoard => element.type === "pcb_board",
  )
  if (!pcbBoard) throw new Error("No pcb_board found in circuit json")

  // Every pour in the batch sees the same immutable circuit and subcircuit.
  const globalConnectivityMap =
    getFullConnectivityMapFromCircuitJson(circuitJson)
  const subcircuitConnectivityMap = buildSubcircuitConnectivityLookup(
    circuitJson,
    globalConnectivityMap,
    subcircuitId,
  )
  const inputProblems = optionsList.map((options) =>
    convertSingleCopperPourToInputProblem(circuitJson, {
      options,
      pcbBoard,
      subcircuitConnectivityMap,
    }),
  )
  if (!Array.isArray(optionsOrOptions)) return inputProblems[0]!

  const padsByLayerAndId = new Map<CopperPadLayerKey, InputPad>()
  for (const inputProblem of inputProblems) {
    for (const pad of inputProblem.pads)
      padsByLayerAndId.set(`${pad.layer}:${pad.padId}`, pad)
  }
  return {
    pads: [...padsByLayerAndId.values()],
    regionsForPour: inputProblems.flatMap(
      (inputProblem) => inputProblem.regionsForPour,
    ),
  }
}
