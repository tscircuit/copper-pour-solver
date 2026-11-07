import type { AnyCircuitElement, PcbBoard } from "circuit-json"

// Board-world positions in mm: +X right, +Y up, +Z above the PCB.
export const panelBoards: PcbBoard[] = [
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_left",
    center: { x: -9, y: 0 },
    width: 10,
    height: 8,
    thickness: 1.6,
    num_layers: 2,
    material: "fr4",
  },
  {
    type: "pcb_board",
    pcb_board_id: "pcb_board_right",
    center: { x: 8, y: 0 },
    width: 12,
    height: 10,
    thickness: 1.6,
    num_layers: 2,
    material: "fr4",
    outline: [
      { x: 2, y: -5 },
      { x: 14, y: -5 },
      { x: 14, y: 2 },
      { x: 11, y: 5 },
      { x: 2, y: 5 },
    ],
  },
]

export const panelCircuitJson: AnyCircuitElement[] = [
  ...panelBoards,
  {
    type: "source_net",
    source_net_id: "source_net_gnd",
    name: "GND",
    member_source_group_ids: [],
    subcircuit_connectivity_map_key: "panel_gnd",
  },
  ...panelBoards.map((board, boardIndex) => ({
    type: "pcb_note_text" as const,
    pcb_note_text_id: `pcb_note_text_${boardIndex}`,
    pcb_board_id: board.pcb_board_id,
    anchor_position: { x: board.center.x, y: 0 },
    anchor_alignment: "center" as const,
    text:
      boardIndex === 0
        ? "LEFT: own rectangular pour"
        : "RIGHT: own chamfered pour",
    font: "tscircuit2024" as const,
    font_size: 0.5,
    rotation: 0,
    layer: "top" as const,
  })),
]
