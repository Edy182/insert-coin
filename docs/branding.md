# Branding decisions

## Project name

**Primary:** Clawd Bytes
**Tagline candidates:**
- "Retro games for whale bros"  *(if leaning into DeepSeek crossover)*
- "Retro games for the AI dev community"
- "Built for the breaks between builds"
- "Press start, escape the prompt"

**Plan B name (rebrand fallback if C&D):** Pixel Arcade, AI Arcade, or 8-Bit Lab

## Color palette

| Use | Color | Hex |
|---|---|---|
| Primary (Clawd orange) | bright orange | `#FF8A1F` |
| Background dark | deep navy | `#0B1426` |
| Background light | warm cream | `#F5EFE0` |
| Accent green | retro green | `#3FCB7A` |
| Accent red (game over) | warm red | `#E5564B` |
| UI gray | warm gray | `#7E8C99` |

## Typography

- **Headings + UI:** "Press Start 2P" (Google Fonts, free, 8-bit feel)
- **Body / paragraphs:** "Inter" or "JetBrains Mono" (clean sans-serif or monospace)
- **Score / numbers:** "VT323" (terminal-style monospace)

## The Clawd character

The character should be a stylized variant inspired by Anthropic's Clawd mascot — same 8-bit retro orange vibe but with enough distinct features to defend as original IP if needed.

### MidJourney prompt for sprite concepts

```
8-bit pixel art character, small friendly orange creature, retro arcade 
mascot style, 16x16 or 24x24 sprite, simple geometric shapes, bright 
orange body with darker orange shading, big expressive eyes, viewed from 
side for running animation, on transparent background, no text, retro 
NES/SNES aesthetic, 1980s arcade game character design, vector style
```

Generate 30-40 variations, pick 3 favorites, then refine in Aseprite.

### Distinguishing features vs Anthropic's Clawd

Aim to include at least 3 of these to defend as our own variant:
1. **Slightly different proportions** (taller, shorter, or stockier than the official Clawd)
2. **A signature accessory** (sweatband, gaming headphones, 8-bit goggles)
3. **Different facial expression** (more cartoonishly excited vs Anthropic's chill)
4. **A unique color secondary** (e.g., we add a small green or blue accent that Clawd doesn't have)
5. **Different animation poses** (especially the running cycle and the jump pose)

We're inspired by Clawd, not copying. Yoshi vs Pikachu — same family, distinct characters.

## Supporting characters (game ecosystem)

Future games will introduce:

- **The Bugs** (enemies in Runner): small purple bugs with antenna
- **The Errors** (enemies in Chomp/Pac-Man):
  - NullPointer (red, aggressive)
  - OffByOne (pink, ambushes)
  - RaceCondition (cyan, unpredictable)
  - TimeoutException (orange, slow)
- **The Tokens** (collectibles): minimal colored circles representing AI tokens — orange (Clawd), pink (DeepSeek), green (GPT), blue (Gemini)

This builds a coherent universe across games.

## Logo

Simple wordmark + sprite:
- `CLAWD BYTES` in Press Start 2P, white on dark navy
- Clawd sprite to the left of the text
- Optional: small "blink" CSS animation on the sprite for landing page

## Landing page tone

Retro arcade marquee — think 1980s arcade hall but minimal modern web design. Black background, neon orange + green accents, scanline overlay (CSS effect).

Header: "Welcome to Clawd Bytes" + game cards arranged horizontally.

Each game card: sprite preview + name + tagline + play button.

Footer: disclaimer + Discord link + GitHub link + X link.

## Sound design notes

- Game start: classic arcade "ding"
- Jump: short pitched "boop"
- Collision / game over: descending tone
- Score milestone (every 100): cheerful "ding ding"
- Background music: minimal chiptune loop, optional toggle (some users prefer silent)

Sources: freesound.org (CC-licensed), Pixabay sound effects (free), or commission a small chiptune artist on Fiverr for ~$50 per game soundtrack.

## What we DON'T do with branding

- ❌ Use Anthropic's exact logo or wordmark
- ❌ Claim to be "official" anywhere
- ❌ Imitate Anthropic's website design too closely
- ❌ Use proprietary fonts from Anthropic's brand kit (if any)
- ❌ Sell merchandise that looks like official Anthropic merch
