import type { CrossSection } from "./manifold-runtime"

/** Release owned native geometry once; a returned or borrowed section stays live. */
export function releaseCrossSections(
  sections: Iterable<CrossSection | undefined>,
  retainedSection?: CrossSection,
): void {
  for (const section of new Set(sections)) {
    if (section && section !== retainedSection) section.delete()
  }
}
