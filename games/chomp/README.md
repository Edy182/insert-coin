# Clawd Chomp (Pac-Man clone) — Month 2

Target ship: ~6 weeks after Clawd Runner launches.

## Concept

Pac-Man but Clawd is the player character. Maze full of "AI tokens" (small colored dots: orange/Clawd, pink/DeepSeek, green/GPT, blue/Gemini) to chomp. Four "Error" ghosts chase you:

| Ghost | Color | Behavior |
|---|---|---|
| **NullPointer** | red | Direct chase — always heads toward Clawd |
| **OffByOne** | pink | Ambush — targets the tile Clawd will be in 4 frames |
| **RaceCondition** | cyan | Unpredictable — random moves with occasional chase |
| **TimeoutException** | orange | Slow but persistent — never stops |

## Power-ups

- **Power pellet** (large orange dot in 4 corners) → eat to make ghosts vulnerable for 6 seconds
- **Cache hit** (yellow dot) → 2x score for 3 seconds
- **Linter pass** (very rare) → freezes all ghosts for 2 seconds

## Tech

Same vanilla HTML5 Canvas as Runner. Maze stored as 2D array. Tile-based movement.

## To do (when we start month 2)

- [ ] Sprite design: Clawd in Pac-Man pose + 4 ghost types
- [ ] Maze design (single level for MVP)
- [ ] Tile-based movement system
- [ ] Ghost AI per personality
- [ ] Power-up mechanics
- [ ] Score + high score
- [ ] Win condition (clear all dots)
- [ ] Game over screen
- [ ] Add to landing page when shipped
