# Plan: Visually Appealing Highlighting

## Context

The current word and sentence highlights use bare `background-color` only — functional but flat. The goal is to make them look polished (like Speechify/Kindle) while keeping the dual word+sentence hierarchy clear. The CSS Custom Highlight API limits us to: `background-color`, `color`, `text-decoration`, `text-shadow`, `-webkit-text-fill-color`, `-webkit-text-stroke-color`.

## Changes

### 1. Enhanced word highlight CSS — `src/content/highlighting/styles.ts`

Add `text-decoration` (underline) and `text-shadow` (soft glow) to the word highlight. These two additions transform a flat color swatch into a layered, polished look.

```css
::highlight(ir-word) {
  background-color: ${wordColor};
  text-decoration: underline;
  text-decoration-color: ${deriveUnderline(wordColor)};  /* same hue, 0.7 opacity */
  text-decoration-thickness: 2px;
  text-shadow: 0 0 8px ${deriveGlow(wordColor)};         /* same hue, 0.25 opacity */
}
```

Sentence highlight stays as-is (background-color only) — the hierarchy comes from the word being more prominent.

Add a `deriveAccentColors(rgba)` helper in `styles.ts` that parses the user's rgba color and returns `{ underline, glow }` at 0.7 and 0.25 opacity respectively.

### 2. Scrub hover underline — `src/content/highlighting/styles.ts`

Add a dotted underline to reinforce the "clickable" affordance:
```css
::highlight(ir-scrub-hover) {
  background-color: rgba(0, 0, 0, 0.06);
  text-decoration: underline dotted;
  text-decoration-color: rgba(0, 0, 0, 0.15);
  text-decoration-thickness: 1px;
}
```

### 3. Mark fallback parity — `src/content/highlighting/styles.ts`

Update `mark.ir-word-mark` to match: add `text-decoration`, `box-shadow` (approximates `text-shadow`), `border-radius: 3px`, `transition: background-color 0.15s ease` for smooth word-to-word movement. Update scrub hover mark similarly.

### 4. Highlight paint order — `src/content/highlighting/highlight-manager.ts`

Set explicit `priority` on Highlight objects so word always paints on top of sentence:
```typescript
this.sentenceHighlight.priority = 0;
this.scrubHoverHighlight.priority = 1;
this.wordHighlight.priority = 2;
```

### 5. Refined default opacities — `src/options/Options.tsx` + `src/lib/constants.ts`

Since the word now has underline + glow doing visual work, slightly reduce background opacity:
- Word colors: 0.4 → 0.35
- Sentence colors: 0.1 → 0.08

Update `HIGHLIGHT_COLORS`, `SENTENCE_COLORS` in Options.tsx and `DEFAULT_SETTINGS.highlight` in constants.ts.

## Files to modify

| File | What changes |
|------|-------------|
| `src/content/highlighting/styles.ts` | Add `deriveAccentColors()`, update `buildCSS()` with text-decoration/shadow/mark styles |
| `src/content/highlighting/highlight-manager.ts` | Set `.priority` on Highlight objects in `init()` |
| `src/options/Options.tsx` | Update opacity in `HIGHLIGHT_COLORS` and `SENTENCE_COLORS` |
| `src/lib/constants.ts` | Update default word/sentence color opacities |

## Verification

1. `npm run typecheck` — ensure no type errors
2. `npm run build` — ensure clean build
3. Manual test: load extension on a Wikipedia article, play TTS, verify word highlight has underline + glow, sentence is subtle, scrub hover shows dotted underline
4. Test with each color preset in Options to confirm derived colors look good across all 6 hues
5. Test on dark-background pages (glow effect should look even better on dark)
