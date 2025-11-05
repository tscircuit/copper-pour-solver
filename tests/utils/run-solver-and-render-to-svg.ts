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

export const runSolverAndRenderToSvg = (
  circuitJson: AnyCircuitElement[],
  pour_options: {
    layer: LayerRef
    net_name: string
    pad_margin: number
    trace_margin: number
  },
) => {
  const source_net = circuitJson.find(
    (elm): elm is SourceNet =>
      elm.type === "source_net" && elm.name === pour_options.net_name,
  )

  if (!source_net) {
    throw new Error(`Net with name "${pour_options.net_name}" not found`)
  }
  if (!source_net.subcircuit_connectivity_map_key) {
    throw new Error(`Net "${pour_options.net_name}" has no connectivity key`)
  }

  const pour_connectivity_key = source_net.subcircuit_connectivity_map_key

  const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
    ...pour_options,
    pour_connectivity_key,
  })

  const solver = new CopperPourPipelineSolver(inputProblem)
  const output = solver.getOutput()

  const pcb_copper_pours: PcbCopperPourBRep[] = output.brep_shapes.map(
    (brep_shape, i) =>
      ({
        type: "pcb_copper_pour",
        shape: "brep",
        pcb_copper_pour_id: `pcb_copper_pour_${i}`,
        layer: pour_options.layer,
        source_net_id: source_net.source_net_id,
        brep_shape: {
          outer_ring: brep_shape.outer_ring,
          inner_rings: brep_shape.inner_rings,
        },
        covered_with_solder_mask: true,
      }) as PcbCopperPourBRep,
  )

  const finalCircuitJson = [...circuitJson, ...pcb_copper_pours]

  const svg = convertCircuitJsonToPcbSvg(finalCircuitJson as any)
  return svg
}
