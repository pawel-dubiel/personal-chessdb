# CRUSH.md

## Project Overview
Chess database app with Node.js/Express backend and vanilla JS frontend. Stores PGN games in SQLite, supports search, import, position indexing.

## Common Commands
- Install dependencies: npm install
- Start server: npm start
- Development mode: npm run dev
- Run all tests: npm test
- Run single test (unit): npm run test:unit
- Run single test (multipiece): npm run test:multipiece
- Run API tests: npm run test:api
- Run performance tests: npm run test:performance
- Build piece index: npm run build-index
- No lint command defined - consider adding ESLint
- No build command needed (Node.js runtime)

## Code Style Guidelines
- Naming: camelCase for variables/functions, PascalCase for classes (rare)
- Imports: Use require() in backend (CommonJS), no imports in frontend scripts
- Formatting: 2-space indentation, semicolons required
- Types: Plain JavaScript - no TypeScript, use JSDoc if needed
- Error Handling: try-catch blocks, console.error logging, return error objects/responses
- Functions: Mix of function declarations and arrows; prefer arrows for callbacks
- SQL: Use prepared statements for security
- Comments: Minimal, use // for single-line
- Files: Backend in server.js/src/, frontend in public/app.js

## Codebase Structure
- server.js: Main Express server and API
- src/: Utilities like pgnUtils.js, positionIndex.js
- public/: Frontend - index.html, app.js, styles.css
- tests/: Test scripts (*.js, *.sh)
- scripts/: Helper scripts like build-piece-index.js
- uploads/: Temporary file storage (gitignore'd)
- Database: chess_database.db (SQLite, gitignore'd)

"