# Rotated-chip clearance investigation

Reported board: https://am3352-six-layer-routing-proof.seveibar.chatgpt.site/#file=am3352.circuit.json

The rotation hypothesis does **not** reproduce on the current solver. The tests
render an asymmetric circular-pad array on an off-origin chip at 0, 45, 90, 180,
and 270 degrees. They check absolute pad coordinates and every clearance vertex
against independently calculated centers and radii. The 90-degree case also has
an SVG snapshot.

```sh
bun test tests/repro07-rotated-chip
```

## Saved-board comparison

The downloaded board has SHA-256
`dfae7a2a6875d764622ded7d33f92dbe7349a55edace642e34f5de8554f1f340`.
U3 (`pcb_component_1`) has rotation 0, center approximately (0, -29), and 96
circular pads already placed in board coordinates. Its saved top-layer copper
has IDs beginning with `reuse_pcb_copper_pour_`.

Run the diagnostic against the decompressed board:

```sh
curl -L https://am3352-six-layer-routing-proof.seveibar.chatgpt.site/am3352/circuit.json.gz -o /tmp/am3352.circuit.json.gz
gzip -dc /tmp/am3352.circuit.json.gz > /tmp/am3352.circuit.json
bun tests/repro07-rotated-chip/compare-saved-pours.ts /tmp/am3352.circuit.json
```

At (-12.6, -28.5), (-12.8, -29), (-10, -34), and (-11, -34), the saved top-layer
DDR_1V5 pour (`reuse_pcb_copper_pour_133_0`) contains no copper, while fresh
solver output within that same outer boundary contains copper. This
reproduces the displaced voids in the saved artifact, not a rotation failure in
the solver. The diagnostic preserves the saved pour net and outer boundary, but rebuilds its
clearances from current board objects. It uses 0.2 mm pad/trace margins; it is not a byte-for-byte
reconstruction of the original pour generation settings.

The evidence is consistent with stale pours retained after geometry changes.
The generating script and exact history of those changes have not been identified.
Component rotation should not be applied again to absolute pad coordinates.
A solver rotation patch is therefore not justified by this reproduction.
