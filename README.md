# @tscircuit/copper-pour-solver

Solves PCB copper pour regions from Circuit JSON or from a small geometry input
format, returning `pcb_copper_pour`-ready B-Rep shapes.

## Install

```bash
bun add @tscircuit/copper-pour-solver
```

This package expects TypeScript 5 as a peer dependency.

## Basic Usage With Circuit JSON

Initialize the geometry runtime once before solving. Then convert Circuit JSON
into the solver input format, run the solver, and map the returned B-Rep shapes
back into `pcb_copper_pour` elements.

```ts
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
  initializeManifoldGeometry,
} from "@tscircuit/copper-pour-solver"

await initializeManifoldGeometry()

const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
  layer: "top",
  source_net_name: "GND",
  pad_margin: 0.4,
  trace_margin: 0.2,
  board_edge_margin: 0.1,
  cutout_margin: 0.2,
})

const solver = new CopperPourPipelineSolver(inputProblem)
const { brep_shapes } = solver.getOutput()
```

`convertCircuitJsonToInputProblem` reads board bounds or outline, SMT pads,
plated holes, mechanical holes, vias, traces, and cutouts for the selected layer.
Pads and traces connected to the selected source net are kept connected to the
pour; unrelated geometry is subtracted using the configured margins.

## Selecting The Pour Net

Prefer selecting by source net name or id:

```ts
const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
  layer: "top",
  source_net_name: "GND",
  pad_margin: 0.4,
  trace_margin: 0.2,
})
```

You can also pass the source net's stable `subcircuit_connectivity_map_key`
directly:

```ts
const gnd = circuitJson.find(
  (element) => element.type === "source_net" && element.name === "GND",
)

const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
  layer: "top",
  subcircuit_id: gnd.subcircuit_id,
  subcircuit_connectivity_map_key: gnd.subcircuit_connectivity_map_key,
  pad_margin: 0.4,
  trace_margin: 0.2,
})
```

Pass `subcircuit_id` when selecting a net inside a subcircuit. The converter
considers that subcircuit and its child subcircuits, but it does not treat
matching child `subcircuit_connectivity_map_key` values as connected unless the
Circuit JSON connectivity actually connects them. Internally, the generated
`globalConnectivityMap` is kept separate from the scoped
`subcircuitConnectivityMap`; scoped solver connectivity keys are prefixed with
their subcircuit id.

Do not generate or pass ids from `circuit-json-to-connectivity-map`. The
converter handles PCB connectivity internally and normalizes it to stable
`subcircuit_connectivity_map_key` values.

## Manual Input

You can skip Circuit JSON conversion and provide the solver input directly.

```ts
import {
  CopperPourPipelineSolver,
  initializeManifoldGeometry,
  type InputProblem,
} from "@tscircuit/copper-pour-solver"

await initializeManifoldGeometry()

const input: InputProblem = {
  regionsForPour: [
    {
      shape: "rect",
      layer: "top",
      bounds: { minX: -10, minY: -5, maxX: 10, maxY: 5 },
      connectivityKey: "net:GND",
      padMargin: 0.4,
      traceMargin: 0.2,
      board_edge_margin: 0.1,
    },
  ],
  pads: [
    {
      shape: "circle",
      padId: "via_1",
      layer: "top",
      connectivityKey: "net:VCC",
      x: 0,
      y: 0,
      radius: 0.5,
    },
  ],
}

const output = new CopperPourPipelineSolver(input).getOutput()
```

Supported input pad shapes are `rect`, `circle`, `pill`, `trace`, and `polygon`.
Use the same `connectivityKey` as the pour for pads/traces that should connect to
the copper island; use a different key for blockers that should be cleared.

## Output

`getOutput()` returns:

```ts
interface PipelineOutput {
  brep_shapes: BRepShape[]
}
```

Each B-Rep shape is compatible with Circuit JSON copper pour data:

```ts
interface BRepShape {
  outer_ring: {
    vertices: Array<{ x: number; y: number; bulge?: number }>
  }
  inner_rings: Array<{
    vertices: Array<{ x: number; y: number; bulge?: number }>
  }>
}
```

## Development

```bash
bun install
bun run build
bun test
bun start
bun run build:site
```
