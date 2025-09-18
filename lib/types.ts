import type { Bounds, Point } from "@tscircuit/math-utils"

export interface InputPourRegion {
  shape: "rect"
  layer: string
  bounds: Bounds
  margin: number
}

export interface BaseInputPad {
  padId: string
  connectivityKey: string
  layer: string
}

export interface InputRectPad extends BaseInputPad {
  shape: "rect"
  bounds: Bounds
}

export interface InputTracePad extends BaseInputPad {
  shape: "trace"
  width: number
  segments: Point[]
}

export type InputPad = InputRectPad | InputTracePad

export interface InputProblem {
  regionsForPour: InputPourRegion[]
  pads: InputPad[]
}

export interface PipelineOutput {
  // b-rep shapes?
}
