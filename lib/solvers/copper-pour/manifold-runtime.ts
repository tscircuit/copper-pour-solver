import type {
  CrossSection as CrossSectionType,
  ManifoldToplevel,
} from "manifold-3d"
import {
  getManifoldModule,
  getManifoldModuleSync,
  setWasmUrl,
} from "manifold-3d/lib/wasm.js"
import { describeScaledPolygons, type ScaledPolygons } from "./polygon-ring"

let manifoldModulePromise: Promise<ManifoldToplevel> | null = null

export const initializeManifoldGeometry = async () => {
  if (getManifoldModuleSync()) return

  // Minimal fix for "Invalid URL" error in sandboxed environments
  try {
    new URL("test.wasm", import.meta.url)
  } catch (e) {
    const isBrowser = typeof (globalThis as any).window !== "undefined"
    if (isBrowser) {
      setWasmUrl("https://unpkg.com/manifold-3d@3.4.1/manifold.wasm")
    }
  }

  manifoldModulePromise ??= getManifoldModule().catch((error) => {
    manifoldModulePromise = null
    throw error
  })
  await manifoldModulePromise
}

export const isManifoldGeometryInitialized = () =>
  Boolean(getManifoldModuleSync())

export const getCrossSection = () => {
  const manifold = getManifoldModuleSync()
  if (!manifold) {
    throw new Error(
      "Manifold geometry has not been initialized. Call initializeManifoldGeometry() before solving copper pours.",
    )
  }
  return manifold.CrossSection
}

export const runManifoldOperation = <T>(
  operation: string,
  polygons: ScaledPolygons,
  callback: () => T,
): T => {
  try {
    return callback()
  } catch (error) {
    const details = describeScaledPolygons(polygons)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${operation} failed: ${message}; details=${JSON.stringify(details)}`,
    )
  }
}

export type CrossSection = CrossSectionType
