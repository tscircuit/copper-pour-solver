# @tscircuit/copper-pour-solver

Solves PCB copper pour regions from Circuit JSON or from a small geometry input
format, returning `pcb_copper_pour`-ready B-Rep shapes.

[Site](https://copper-pour-solver.vercel.app)


## Install

```bash
bun add @tscircuit/copper-pour-solver
```

This package expects TypeScript 5 as a peer dependency.

## Basic Usage With Circuit JSON

Initialize the geometry runtime once before solving. Then convert Circuit JSON
into the solver input format, run the solver, and map the returned B-Rep shapes
back into `pcb_copper_pour` elements.

```tsx
import {
  CopperPourPipelineSolver,
  convertCircuitJsonToInputProblem,
  initializeManifoldGeometry,
} from "@tscircuit/copper-pour-solver"

await initializeManifoldGeometry()

const gnd = circuitJson.find(
  (element) => element.type === "source_net" && element.name === "GND",
)

const inputProblem = convertCircuitJsonToInputProblem(circuitJson, {
  layer: "top",
  pour_connectivity_key: gnd.subcircuit_connectivity_map_key,
  pad_margin: 0.4,
  trace_margin: 0.2,
  board_edge_margin: 0.1,
  cutout_margin: 0.2,
})

const solver = new CopperPourPipelineSolver(inputProblem)
solver.solve()

const { brep_shapes } = solver.getOutput()
```

`convertCircuitJsonToInputProblem` reads board bounds or outline, SMT pads,
plated holes, mechanical holes, vias, traces, and cutouts for the selected layer.
Pads and traces connected to `pour_connectivity_key` are kept connected to the
pour; unrelated geometry is subtracted using the configured margins.

## Finding The Pour Connectivity Key

When you start from a net name, use the source net's existing
`subcircuit_connectivity_map_key`.

```tsx
const gnd = circuitJson.find(
  (element) => element.type === "source_net" && element.name === "GND",
)

const pour_connectivity_key = gnd.subcircuit_connectivity_map_key
```

Pass that value as `pour_connectivity_key` when converting Circuit JSON.

## Manual Input

You can skip Circuit JSON conversion and provide the solver input directly.

```tsx
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

```tsx
interface PipelineOutput {
  brep_shapes: BRepShape[]
}
```

Each B-Rep shape is compatible with Circuit JSON copper pour data:

```tsx
interface BRepShape {
  outer_ring: {
    vertices: Array<{ x: number; y: number; bulge?: number }>
  }
  inner_rings: Array<{
    vertices: Array<{ x: number; y: number; bulge?: number }>
  }>
}
```
