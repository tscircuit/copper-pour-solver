import type { InputPourRegion } from "lib/types"
import Flatten from "@flatten-js/core"

export const getBoardPolygon = (region: InputPourRegion): Flatten.Polygon => {
  const clearance = region.clearance ?? 0

  if (region.outline && region.outline.length > 0) {
    const polygon = new Flatten.Polygon(
      region.outline.map((p) => Flatten.point(p.x, p.y)),
    )
    return polygon
  }

  const { bounds } = region
  const newBounds = {
    minX: bounds.minX + clearance,
    minY: bounds.minY + clearance,
    maxX: bounds.maxX - clearance,
    maxY: bounds.maxY - clearance,
  }

  if (newBounds.minX >= newBounds.maxX || newBounds.minY >= newBounds.maxY) {
    return new Flatten.Polygon()
  }

  return new Flatten.Polygon(
    new Flatten.Box(
      newBounds.minX,
      newBounds.minY,
      newBounds.maxX,
      newBounds.maxY,
    ).toPoints(),
  )
}
