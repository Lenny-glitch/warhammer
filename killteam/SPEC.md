# Kill Team - Tau vs Drukhari
## Project Overview
A 2-player turn-based Kill Team game playable across two locations.
Players share a link to exchange moves. Each player sees an animated 
replay of their opponent's last turn before taking control.
Phase 1: Tau (Pathfinders) vs Drukhari (Wyches) only.
## Tech Stack
HTML, CSS, vanilla JavaScript (single file to start)
- Firebase Realtime Database for game state
- No framework, no build tools, no dependencies beyond Firebase SDK
## Board
 2D top-down view, 22" x 30" Kill Team standard board
- Pixels-per-inch scale: 20px = 1 inch
- Semi-grid: free placement but movement measured in inches
- Terrain: simple rectangular blocking shapes, defined in data
- Each player sees the board from their own side (board flips perspective)
## Units
Each unit is a token: colored circle, unit name abbreviation, wounds remaining.
Tau (blue tokens) - Pathfinder Kill Team:
- 1x Pathfinder Shas'ui (leader) - 7 wounds, M6", BS4+, pulse rifle 30" AP0 D1
- 7x Pathfinder - 7 wounds, M6", BS4+, pulse carbine 18" AP0 D1
- 1x Pathfinder w/ Ion Rifle - 7 wounds, M6", BS4+, ion rifle 30" AP-1 D2
- 1x Pathfinder w/ Rail Rifle - 7 wounds, M6", BS4+, rail rifle 30" AP-2 D2

Drukhari (red tokens) - Wych Kill Team:
- 1x Hekatrix (leader) - 8 wounds, M8", WS3+, hekatarii blade AP-1 D1
- 9x Wych - 8 wounds, M8", WS3+, hekatarii blade AP-1 D1
- 1x Wych w/ Razorflail - 8 wounds, M8", WS3+, razorflail AP0 D1 reroll wounds
- 1x Wych w/ Shardnet - 8 wounds, M8", WS3+, shardnet AP0 D1 enemy -1 attack

Token display: circle with faction color, abbreviation text, wound counter below.
Active token: bright outline. Selected token: dashed outline. Dead token: removed.
## Turn Structure
Kill Team uses alternating activations, not alternating full turns.
Each battle round:
1. Initiative phase - both players roll off, winner chooses who activates first
2. Activation phase - players alternate activating one operative each
   Each activation: Move OR Charge, then Shoot OR Fight
3. Morale phase - broken operatives take tests

UI guides player through each step with:
- Highlighted valid actions
- Measurement overlay showing range/movement
- Dice roller with results displayed
- Confirm button before committing each action
- All actions logged for replay
## Replay System
When a player opens a shared link and it's their turn, before they 
get control they watch a replay of their opponent's last activation:
- Tokens animate along the path they moved (smooth, ~1 second)
- Shot lines drawn as colored beams (blue for Tau, red for Drukhari)
- Dice rolls displayed on screen with results
- Wound removal animated (token dims, wound counter drops)
- Movement arrows shown with inch measurements
- Skip button available after 2 seconds
After replay completes, control hands to the current player.
## Replay System
When a player opens a shared link and it's their turn, before they 
get control they watch a replay of their opponent's last activation:
- Tokens animate along the path they moved (smooth, ~1 second)
- Shot lines drawn as colored beams (blue for Tau, red for Drukhari)
- Dice rolls displayed on screen with results
- Wound removal animated (token dims, wound counter drops)
- Movement arrows shown with inch measurements
- Skip button available after 2 seconds
After replay completes, control hands to the current player.
## Firebase Structure
games/
  {gameId}/
    state:
      round: 1
      phase: "initiative" | "activation" | "morale"
      activePlayer: "tau" | "drukhari"
      initiative: "tau" | "drukhari" | null
      units:
        tau: [ array of unit objects ]
        drukhari: [ array of unit objects ]
      terrain: [ array of terrain objects ]
    log:
      [ array of action objects, append only ]
        each action contains:
          type: "move" | "shoot" | "fight" | "morale"
          unitId: string
          from: {x, y}
          to: {x, y}
          target: unitId | null
          diceRolls: [ array of numbers ]
          result: string
          timestamp: number
## Phase 1 Deliverable
A single HTML file that:
- Loads game state from Firebase on open
- Creates a new game if no gameId in URL, generates shareable link
- Joins existing game if gameId present in URL
- Shows 2D board with terrain and unit tokens
- Guides current player through their activation step by step
- Logs every action to Firebase
- Shows replay of opponent's last activation on load
- Works in Chrome on desktop
- No login required, link sharing only