# Clawd Tetris — Month 4

Target ship: ~14-16 weeks after Clawd Runner launches.

## Concept

Standard Tetris but each piece is themed as a code structure:

| Piece | Theme | Color |
|---|---|---|
| I (4 in a row) | Function declaration | cyan |
| O (2x2 square) | `{}` (curly braces) | yellow |
| T | `if/else` branch | purple |
| L | Array `[]` | orange |
| J | Function params `()` | blue |
| S | Promise chain | green |
| Z | Async/await | red |

When you clear a line, the message is "**LINE REFACTORED**" instead of "LINE CLEARED".

Game over: "**STACK OVERFLOW**" (same as Runner — keep universe coherent).

## Tech

Tile grid (10 wide x 20 tall). Vanilla Canvas. Standard Tetris rotation rules.

Polish: subtle Clawd animation watching from the side of the field, reacting to your performance (excited on near-tetrises, sad on game over).

## To do (when we start month 4)

- [ ] Sprite design: themed Tetris pieces with code structure decorations
- [ ] Game loop: piece falling, rotation, locking
- [ ] Line clear detection + scoring
- [ ] Increasing fall speed by level
- [ ] Side animation of Clawd as observer character
- [ ] Score + high score
- [ ] Add to landing page when shipped
