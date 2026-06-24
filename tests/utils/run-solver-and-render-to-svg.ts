import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
} from "lib/index"
import type {
  AnyCircuitElement,
  LayerRef,
  PcbCopperPourBRep,
  SourceNet,
} from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import type { Point } from "@tscircuit/math-utils"

interface PourOptions {
  layer: LayerRef
  net_name: string
  pad_margin: number
  trace_margin: number
  board_edge_margin?: number
  cutout_margin?: number
  outline?: Point[]
}

export const runSolverAndRenderToSvg = (
  circuitJson: AnyCircuitElement[],
  pour_options: PourOptions | PourOptions[],
) => {
  const pourOptionsArray = Array.isArray(pour_options)
    ? pour_options
    : [pour_options]

  const allCopperPours: PcbCopperPourBRep[] = []

  for (const options of pourOptionsArray) {
    const source_net = circuitJson.find(
      (elm): elm is SourceNet =>
        elm.type === "source_net" && elm.name === options.net_name,
    )

    if (!source_net) {
      throw new Error(`Net with name "${options.net_name}" not found`)
    }

    if (!source_net.subcircuit_connectivity_map_key) {
      throw new Error(
        `Net "${options.net_name}" has no subcircuit_connectivity_map_key`,
      )
    }

    const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
      ...options,
      source_net_id: source_net.source_net_id,
    })

    const solver = new CopperPourPipelineSolver(inputProblem)
    const output = solver.getOutput()

    const pcb_copper_pours: PcbCopperPourBRep[] = output.brep_shapes.map(
      (brep_shape, i) =>
        ({
          type: "pcb_copper_pour",
          shape: "brep",
          pcb_copper_pour_id: `pcb_copper_pour_${allCopperPours.length + i}`,
          layer: options.layer,
          source_net_id: source_net.source_net_id,
          brep_shape: {
            outer_ring: brep_shape.outer_ring,
            inner_rings: brep_shape.inner_rings,
          },
          covered_with_solder_mask: true,
        }) as PcbCopperPourBRep,
    )

    allCopperPours.push(...pcb_copper_pours)
  }

  const finalCircuitJson = [...circuitJson, ...allCopperPours]

  const svg = convertCircuitJsonToPcbSvg(finalCircuitJson as any)
  return svg
}
