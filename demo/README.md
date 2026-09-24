# demo assets

- **`demo.svg`** — the animated terminal demo embedded in the top-level README.
- **`demo.cast`** — asciinema v2 recording (source of truth).
- **`build-cast.mjs`** — regenerates `demo.cast` with correct ANSI escapes.

## Regenerate

```bash
node demo/build-cast.mjs
npx svg-term-cli --in demo/demo.cast --out demo/demo.svg --window --width 78 --height 16
```

## Want a literal .gif instead of the SVG?

Render the same cast with [agg](https://github.com/asciinema/agg):

```bash
agg demo/demo.cast demo/demo.gif
```
