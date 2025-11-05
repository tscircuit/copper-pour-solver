import type { InputPourRegion } from "lib/types"
import Flatten from "@flatten-js/core"

export const getBoardPolygon = (region: InputPourRegion): Flatten.Polygon => {
  if (region.outline && region.outline.length > 0) {
    return new Flatten.Polygon(
      region.outline.map((p) => Flatten.point(p.x, p.y)),
    )
  }
  const { bounds } = region
  return new Flatten.Polygon(
    new Flatten.Box(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
    ).toPoints(),
  )
}
