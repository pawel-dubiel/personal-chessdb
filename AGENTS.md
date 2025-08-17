# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (e.g., `pgnUtils.js`, `positionIndex.js`).
- Server: `server.js` (Express + SQLite, API routes under `/api/...`).
- Frontend assets: `public/` (served statically with COEP/COOP headers).
- Tests: `tests/` (Node scripts like `test-optimized-pattern-search.js`).
- Scripts: `scripts/` (`build-piece-index.js`, `demo.js`, `take-screenshots.js`).
- Data: `chess_database.db` (SQLite). Large; don’t include in PR diffs when possible.
- Docs and media: `docs/`, `screenshots/`, sample PGNs in root.

## Build, Test, and Development Commands
- `npm start`: Run the API server (`server.js`) on `http://localhost:3000`.
- `npm run dev`: Start with `nodemon` for live reload.
- `npm test`: Run all test suites (unit, optimized, multipiece).
- `npm run test:unit`: Optimized pattern search tests.
- `npm run test:multipiece`: Multi-piece logic tests.
- `npm run test:api`: Basic API checks via `tests/api-test-commands.sh`.
- `npm run test:performance`: Benchmark core search.
- `npm run build-index`: Build/update piece-location index from games.

## Coding Style & Naming Conventions
- JavaScript (Node 18+ recommended), 2-space indentation, semicolons, single quotes.
- Variables/functions: `camelCase`; classes: `PascalCase`.
- Files: prefer `camelCase.js` (e.g., `positionIndex.js`).
- Keep modules focused; colocate helpers in `src/`.

## Testing Guidelines
- Location: `tests/`. Name tests `test-*.js` and make them runnable with Node.
- Run specific test: `node tests/test-optimized-pattern-search.js`.
- Add small, deterministic cases (see existing tests for structure and helpers).
- No coverage gate; aim to cover new branches and DB query builders.

## Commit & Pull Request Guidelines
- Commits: Imperative, concise subject; explain “what/why”. Example: `fix: correct square index in pattern parser`.
- PRs: Include description, reproduction/verification steps, affected endpoints, and DB changes (migrations/indexes).
- Link issues; attach screenshots for UI changes (`screenshots/`).
- Update `README.md`/`docs/` when APIs, data model, or workflows change.

## Security & Configuration Tips
- SQLite file: `chess_database.db` is local state; back up before experiments.
- Uploads: written to `uploads/`; avoid committing sample uploads.
- CORS is enabled for static assets; be mindful when exposing new routes.
