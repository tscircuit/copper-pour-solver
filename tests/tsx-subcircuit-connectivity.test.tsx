import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import type {
  AnyCircuitElement,
  PcbCopperPourBRep,
  SourceNet,
} from "circuit-json"
import { CopperPourPipelineSolver } from "lib/index"
import { convertCircuitJsonToInputProblem } from "lib/circuit-json/convert-circuit-json-to-input-problem"

const SubcircuitChild = () => (
  <subcircuit
    name="SubcircuitChild"
    pcbX={2}
    pcbY={0}
    autorouter="sequential_trace"
  >
    <pinheader
      name="J2"
      pinCount={2}
      footprint="pinrow2"
      pcbX={0}
      pcbY={0}
      pinLabels={{ pin1: "B", pin2: "C" }}
      showSilkscreenPinLabels
      connections={{ C: "net.GND" }}
    />
  </subcircuit>
)

const SubcircuitConnectivityRepro = () => (
  <board
    name="SubcircuitParent"
    width="10mm"
    height="7mm"
    autorouter="sequential_trace"
  >
    <pinheader
      name="J1"
      pinCount={1}
      footprint="pinrow1"
      pcbX={-3}
      pcbY={0}
      pinLabels={{ pin1: "A" }}
      showSilkscreenPinLabels
      connections={{ A: "net.GND" }}
    />

    <SubcircuitChild />

    <trace from="J1.A" to=".SubcircuitChild > net.GND" />

    <copperpour
      name="top_gnd_pour"
      layer="top"
      connectsTo="net.GND"
      padMargin="0.25mm"
      traceMargin="0.2mm"
    />

    <pcbnotetext
      text="Expected: copper pour connects to A and C, but clears around B."
      pcbX={0}
      pcbY={4.35}
      fontSize="0.22mm"
      anchorAlignment="center"
      color="#ffffff"
    />
    <pcbnotetext
      text="A is parent net.GND; C is child net.GND reached through the parent-to-child net."
      pcbX={0}
      pcbY={4.05}
      fontSize="0.22mm"
      anchorAlignment="center"
      color="#ffffff"
    />
    <pcbnotetext
      text="B is a separate child pin, so the pour should clear around it."
      pcbX={0}
      pcbY={3.75}
      fontSize="0.22mm"
      anchorAlignment="center"
      color="#ffffff"
    />
  </board>
)

const renderCircuitJson = async (): Promise<AnyCircuitElement[]> => {
  const circuit = new Circuit()
  const originalLog = console.log
  const originalWarn = console.warn
  console.log = () => {}
  console.warn = () => {}
  try {
    circuit.add(<SubcircuitConnectivityRepro />)
    await circuit.renderUntilSettled()
    return circuit.getCircuitJson()
  } finally {
    console.log = originalLog
    console.warn = originalWarn
  }
}

test("tsx subcircuit net can be selected without merging child-local connectivity keys", async () => {
  const circuitJson = await renderCircuitJson()
  const gndSourceNets = circuitJson.filter(
    (element): element is SourceNet =>
      element.type === "source_net" && element.name === "GND",
  )

  expect(gndSourceNets).toHaveLength(2)
  expect(
    new Set(gndSourceNets.map((net) => net.subcircuit_connectivity_map_key))
      .size,
  ).toBe(1)
  expect(new Set(gndSourceNets.map((net) => net.subcircuit_id)).size).toBe(2)

  const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
    layer: "top",
    source_net_id: gndSourceNets[0]!.source_net_id,
    pad_margin: 0.25,
    trace_margin: 0.2,
  })

  const pourConnectivityKey = inputProblem.regionsForPour[0]?.connectivityKey
  expect(
    inputProblem.pads.some(
      (pad) => pad.connectivityKey === pourConnectivityKey,
    ),
  ).toBe(true)

  const output = new CopperPourPipelineSolver(inputProblem).getOutput()
  const copperPours: PcbCopperPourBRep[] = output.brep_shapes.map(
    (brep_shape, i) => ({
      type: "pcb_copper_pour",
      shape: "brep",
      pcb_copper_pour_id: `pcb_copper_pour_tsx_subcircuit_${i}`,
      layer: "top",
      source_net_id: gndSourceNets[0]!.source_net_id,
      brep_shape,
      covered_with_solder_mask: true,
    }),
  )
  const svg = convertCircuitJsonToPcbSvg([
    ...circuitJson.filter((element) => element.type !== "pcb_copper_pour"),
    ...copperPours,
  ] as any)

  await expect(svg).toMatchSvgSnapshot(
    import.meta.path,
    "tsx-subcircuit-connectivity",
  )
})
