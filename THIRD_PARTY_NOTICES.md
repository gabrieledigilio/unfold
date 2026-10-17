# Third-party credits

## Three.js

The interactive viewer uses Three.js r180 (npm version 0.180.0), including OrbitControls and RoundedBoxGeometry. The runtime modules are vendored with this application.

- Project: https://github.com/mrdoob/three.js/tree/r180
- Copyright: 2010–2025 three.js authors
- License: MIT; the full notice is retained in `public/vendor/LICENSE.txt`.

## Apple reference material

The MacBook product photograph and manufacturer assembly reference are requested from their original Apple URLs; image binaries are not redistributed in this repository. Their source URLs and attribution are recorded in `public/assets-manifest.json`. Apple retains copyright. No open-source license is asserted for these external images, and they are excluded from the project MIT license.

The interactive laptop is a procedural teaching illustration created for UNFOLD. It simplifies the object and its assemblies; it is not an Apple CAD model or service drawing.

## AI-assisted development

ChatGPT/Codex was used to develop and review this prototype during the hack day. The atlas uses curated reference content and an optional Gemma runtime integration for photo interpretation, generated explanations, and allowlisted scene controls. Gemma is called through Google’s Gemini API using a user-supplied key or a server runtime secret. Model weights are not bundled with this application.
