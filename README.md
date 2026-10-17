# [▶ Open the live demo — UNFOLD](https://unfold-object-lab.epicfawn1.chatgpt.site/?theme=blueprint&view=pitch)

**Public demo — ready to explore in your browser.** The MacBook, lamp, and drill examples work immediately. To generate a blueprint from a photo or ask Gemma a question, connect your own API key in the demo.

---

# UNFOLD

**See how it works.** Turn a photo of an everyday object into an interactive blueprint, then explore its parts, physics, and construction.

Built for **Hacktoberfest Hack Day Milano × Coding Bunker — 17 October 2026**. Powered by **Gemma 4**.

[Gemma documentation](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api) · [MIT license](LICENSE)

## The problem

We use complex objects every day without understanding what happens inside them. Photos, search results, and isolated explanations rarely connect a visible part to its mechanism, the physics behind it, and similar mechanisms in other objects.

## The solution

UNFOLD turns an object into something you can investigate. Start with a photo, generate a simplified assembly, rotate it, unfold it, select a part, and follow how it connects to the rest. Ask a question and Gemma can explain the mechanism while highlighting parts and adjusting the scene.

- **Photo to blueprint:** upload JPG, PNG, or WebP; review the local preview; explicitly generate a study.
- **Interactive 3D:** rotate, zoom, separate the assembly, select components, and inspect their relationships.
- **Connected learning:** explore shared ideas such as light, energy storage, heat transfer, and electromagnetism across objects.
- **Three curated examples:** a 2021 14-inch MacBook Pro, an articulated LED desk lamp, and a cordless drill.
- **A photo-first opening screen:** particles morph between the three examples, with pause controls and reduced-motion support.
- **Three visual themes:** Blueprint, Paper, and Graphite.

## Run locally

Requires **Node.js 22.15 or later** and a modern browser. Three.js is vendored; no dependency installation or build step is needed.

```bash
git clone https://github.com/gabrieledigilio/unfold.git
cd unfold
npm start
```

Open **http://127.0.0.1:3000**. The curated models and their explanations work without an API key.

To use Gemma:

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey) with access to the configured Gemma model.
2. Click **Connect Gemma** and paste the key into the password field. Connecting sends a small verification request.
3. Choose a photo, inspect its preview, then click **Generate blueprint**.
4. Explore the result or ask a question about a selected part.

The default model is `gemma-4-26b-a4b-it`; transient provider failures can try `gemma-4-31b-it`. Access and quotas depend on the Google account/project. Inference is hosted through Google's Gemini API; model weights are not bundled or run locally.

Optional local configuration: copy `.env.example` to `.env`. `GEMINI_API_KEY` supplies a server key, `GEMMA_MODEL` selects a supported model, and `HOST`/`PORT` configure the listener. The default is localhost with a per-tab user key. Never commit `.env` or a real API key.

## Demo flow

1. Advance through the four introduction screens with the arrow button or Right Arrow key. The final screen opens the photo upload page with morphing dotted blueprints. Use **Play introduction** on Home to replay; `?view=home` opens the upload page directly.
2. Open **MacBook**, select a part, unfold the assembly, and follow a shared principle into the lamp or drill.
3. Return **Home** and choose a clear photo of one object on a plain background.
4. Select **Generate blueprint**, then rotate the resulting study and open one of its parts.
5. Ask a question such as “How does this part transfer energy?”

Photo generation can take up to roughly 95 seconds on the backend. The UI shows actual elapsed time and supports cancellation. Test the chosen photo before a live presentation; interpretation and geometry vary between generations.

## How Gemma is used

Gemma interprets the uploaded image and proposes a compact assembly: 2–8 components, simple shapes, approximate positions, mechanisms, construction notes, and connections. A shared schema validates the response before Three.js builds any geometry. A bounded repair pass can correct malformed output. The app does not execute model-generated code.

Questions include the current object and selected part. Responses can use a small allowlist of scene commands, such as highlighting a component, changing the camera, or separating the assembly. Commands are validated on both the server and client. Curated source links are resolved from known IDs; generated studies do not invent citations.

The three curated models are authored procedural examples. Uploaded photos produce separate Gemma-generated studies, including objects outside those three families. Hidden components may be inferred and are labeled accordingly. Results are educational approximations, not exact CAD, measured reconstructions, verified hidden construction, or repair instructions.

## Stack and repository layout

| Area | Implementation |
| --- | --- |
| Interface | HTML, CSS, JavaScript, Canvas 2D particles |
| Interactive geometry | Three.js r180, OrbitControls, procedural assemblies |
| AI | Gemma 4 through the Gemini REST API |
| Portable backend | Node.js built-ins, Web Request/Response API |
| Original hosted runtime | Vinext/Vite on Cloudflare Workers through ChatGPT Sites |
| Persistence | Local browser progress; no application database |

- `index.html` — application shell and import map.
- `public/app.js`, `public/interface.css` — interface, upload flow, connection settings, and scene actions.
- `public/viewer.js`, `object-models.js`, `generated-model.js` — curated and generated 3D assemblies.
- `public/intro-particles.js` — deterministic point clouds and morph animation.
- `public/blueprint-schema.mjs` — shared bounds and geometry validation.
- `public/content.json`, `objects.json` — curated learning material and reference links.
- `lib/gemma.mjs`, `photo-blueprint.mjs` — provider adapter, prompts, retries, validation, and normalization.
- `server.mjs` — portable HTTP adapter serving the same UI and shared AI backend.
- `tests/` — backend, geometry, particle, HTTP, and mocked frontend checks.

This repository exports the working prototype into a standalone Node application. Its portable HTTP adapter replaces the hosted platform's routing wrapper; it does not require ChatGPT Sites credentials or private deployment configuration.

## Privacy and deployment

API keys entered in the UI remain in memory for the current tab and pass through the same-origin server to Google. They are not saved to localStorage, cookies, source code, or a database. Explicitly submitted photos and questions go to Google; provider retention follows Google's terms. Photos, generated studies, and conversation state remain in browser memory. Learning progress for curated examples is stored locally.

The server bounds request bodies, restricts static file access, validates origins, and aborts work when a client disconnects. It does not include user accounts or production rate limiting. Keep the default per-tab key flow for a public demo; deploying with a shared server key requires appropriate access controls and rate limits.

GitHub hosts the source repository. The AI routes need a server, so GitHub Pages alone cannot run the full application. On a Node host, run `npm start`; set `HOST=0.0.0.0` when the platform requires it and `PUBLIC_ORIGIN=https://your-domain.example` behind an HTTPS reverse proxy. Put secrets in the host's environment settings.

## Tests

```bash
npm test
```

Checks cover schema validation, retries and deadlines, provider failures, generated geometry, animation lifecycle, HTTP boundaries, upload/navigation behavior, key handling, and stale-response cancellation. Provider responses are mocked. A passing suite does not establish live Gemma availability or visual fidelity; browser/WebGL visual verification was unavailable in the build environment.

## Original contributions and AI disclosure

Built by **Gabriele** during the hack day with **ChatGPT/Codex** assisting implementation, debugging, and review. Original project work includes the connected object-exploration interface, procedural teaching models, particle morph introduction, photo-to-assembly schema and validation pipeline, generated-object renderer, contextual scene actions, and interaction tests.

Three.js and its example controls/geometries are reused under MIT. The original hosted scaffold was provided by ChatGPT Sites; this export uses a small standalone Node adapter. Gemma performs runtime image interpretation and explanation through Google's API. No model training or fine-tuning was performed.

## License and credits

Original project code is released under the **MIT license**. Third-party code retains its own notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `public/vendor/LICENSE.txt`.

Apple product/reference images are requested from Apple's original URLs and are not redistributed as image files in this repository. They, product names, trademarks, and Gemma model terms are not covered by this project's MIT license. The procedural laptop is an original teaching illustration, not Apple CAD.
