import type { AnyCircuitElement } from "circuit-json"
import type { InputPad, InputProblem } from "lib/types"
import type { CircuitJsonPourContext } from "./CircuitJsonPourContext"
import { createCircuitJsonPourContext } from "./create-circuit-json-pour-context"
import type { ConvertCircuitJsonToInputProblemOptions } from "./ConvertCircuitJsonToInputProblemOptions"
import { getPadsForLayer } from "./get-pads-for-layer"
import { resolvePourConnectivityKey } from "./resolvePourConnectivityKey"

type LayerPadKey = string

export const convertCircuitJsonToInputProblem = (
  circuitJson: AnyCircuitElement[],
  optionsOrOptions:
    | ConvertCircuitJsonToInputProblemOptions
    | ConvertCircuitJsonToInputProblemOptions[],
): InputProblem => {
  if (Array.isArray(optionsOrOptions)) {
    if (optionsOrOptions.length === 0) {
      return { pads: [], regionsForPour: [] }
    }

    const subcircuitId = optionsOrOptions[0]!.subcircuit_id
    if (
      optionsOrOptions.some((options) => options.subcircuit_id !== subcircuitId)
    ) {
      throw new Error(
        "All copper pours in one input problem must use the same subcircuit_id",
      )
    }

    const context = createCircuitJsonPourContext({
      circuitJson,
      subcircuit_id: subcircuitId,
    })
    const inputProblems = optionsOrOptions.map((options) =>
      convertPourWithContext(options, context),
    )
    const padsByLayerAndId = new Map<LayerPadKey, InputPad>()
    for (const inputProblem of inputProblems) {
      for (const pad of inputProblem.pads) {
        padsByLayerAndId.set(`${pad.layer}:${pad.padId}`, pad)
      }
    }

    return {
      pads: [...padsByLayerAndId.values()],
      regionsForPour: inputProblems.flatMap(
        (inputProblem) => inputProblem.regionsForPour,
      ),
    }
  }

  return convertPourWithContext(
    optionsOrOptions,
    createCircuitJsonPourContext({
      circuitJson,
      subcircuit_id: optionsOrOptions.subcircuit_id,
    }),
  )
}

function convertPourWithContext(
  options: ConvertCircuitJsonToInputProblemOptions,
  context: CircuitJsonPourContext,
): InputProblem {
  const { pcb_board } = context
  const pourConnectivityKey = resolvePourConnectivityKey(options, context)

  const pads = getPadsForLayer({ layer: options.layer }, context)

  const { width, height, center } = pcb_board
  const boardBounds =
    width !== undefined && height !== undefined
      ? {
          minX: center.x - width / 2,
          minY: center.y - height / 2,
          maxX: center.x + width / 2,
          maxY: center.y + height / 2,
        }
      : undefined

  // Use pour-specific outline if provided, otherwise fall back to board outline
  const outline = options.outline ?? pcb_board.outline

  let bounds: { minX: number; minY: number; maxX: number; maxY: number }
  if (outline && outline.length > 0) {
    const xs = outline.map((p) => p.x)
    const ys = outline.map((p) => p.y)
    bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    }
  } else if (boardBounds) {
    bounds = boardBounds
  } else {
    throw new Error(
      "pcb_board requires width and height when no outline is provided",
    )
  }

  let boardOutline = options.board_edge_outline
  if (!boardOutline?.length) boardOutline = pcb_board.outline
  if (!boardOutline?.length) {
    if (!boardBounds) {
      throw new Error(
        "pcb_board requires width and height when no outline is provided",
      )
    }
    boardOutline = [
      { x: boardBounds.minX, y: boardBounds.minY },
      { x: boardBounds.maxX, y: boardBounds.minY },
      { x: boardBounds.maxX, y: boardBounds.maxY },
      { x: boardBounds.minX, y: boardBounds.maxY },
    ]
  }

  const regionsForPour = [
    {
      shape: "rect" as const,
      layer: options.layer,
      bounds,
      boardEdgeOutline: options.board_edge_outline,
      boardOutline,
      outline,
      connectivityKey: pourConnectivityKey,
      crosshatch: options.crosshatch,
      crosshatchPitch: options.crosshatchPitch,
      crosshatchWidth: options.crosshatchWidth,
      padMargin: options.pad_margin,
      traceMargin: options.trace_margin,
      pourMargin:
        options.pour_margin ??
        Math.max(options.pad_margin, options.trace_margin),
      board_edge_margin: options.board_edge_margin ?? 0,
      cutout_margin: options.cutout_margin,
      use_thermal_reliefs: options.use_thermal_reliefs,
      thermal_relief_spoke_width: options.thermal_relief_spoke_width,
      thermal_relief_spoke_count: options.thermal_relief_spoke_count,
    },
  ]

  return {
    pads,
    regionsForPour,
  }
}
