# tortue 🐢

A browser-based LOGO (turtle graphics) interpreter, translated from the
original **MIT LISP LOGO (LLOGO)** MACLISP sources into straightforward
vanilla ES6 — no build step, no bundler, no runtime dependencies. Graphics
are rendered to SVG.

## Why this exists

Most browser LOGOs (e.g. [jslogo](https://github.com/inexorabletash/jslogo),
[UCBLogo/Berkeley Logo](https://github.com/jrincayc/ucblogo-code)) are fresh
implementations guided by the Berkeley Logo reference manual. This project
takes a different path: MIT's own Logo implementation was itself written in
Lisp (MACLISP) in the early 1970s, and ES6 — with closures, symbols, and
first-class functions — is close enough in spirit to Lisp (crossed with a
bit of Smalltalk-style message passing for the DOM/SVG side) that the
original source can be translated fairly directly rather than reinvented.

## Provenance

The source translated here is **LLOGO**, written by **Ira Goldstein** and
**Henry Lieberman** at the MIT Artificial Intelligence Laboratory in the
early 1970s, for ITS/MULTICS/TENEX PDP-10 systems. It survives today in the
[PDP-10/its](https://github.com/PDP-10/its) restoration project, at
`src/llogo/`. Background reading:

- MIT AI Memo 307A, ["LLOGO: An Implementation of LOGO in LISP"](https://dspace.mit.edu/bitstream/handle/1721.1/6221/AIM-307a.pdf)
- MIT AI Memo 361, ["The TV Turtle: A Logo Graphics System for Raster Displays"](https://dspace.mit.edu/bitstream/handle/1721.1/5773/AIM-361.pdf)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for exactly which original
files map to which ES6 modules, and what was deliberately left out (the
raster "TV Turtle", the GERMLAND game, the Music Box, and all of the
1970s-teletype-specific plumbing: raw TTY rubout editing, the interactive
line-by-line procedure editor, and interactive break/trace debug loops —
none of which make sense in a browser).

## License

The PDP-10/its project distributes `src/llogo/` under the **GNU General
Public License v3.0 (or later)**; this project, as a direct translation of
that code, is licensed the same way — see [LICENSE](LICENSE).

## Status

🚧 Under active development.

## Running

Open `index.html` in a browser — no server, build step, or install
required. Type Logo code into the editor and press Run.

## Testing

```sh
node --test
```
