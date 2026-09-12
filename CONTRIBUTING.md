# Contributing to BlockProctor

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites
- **Docker** (Compose v2) — runs PostgreSQL, Anvil blockchain, and the backend
- **Node.js 18+** — needed for frontend dev and tests

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/code-sheeraz/blockproctor.git
cd blockproctor

# 2. Start backend + database + blockchain
docker compose up --build

# 3. Run database migrations
docker exec -it blockproctor-backend node migrate.js

# 4. Start the frontend in a separate terminal
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`. See [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) for the full end-to-end verification flow.

## Project Structure

```
blockproctor/
├── frontend/          React + Vite SPA
├── backend/           Express.js REST API
├── blockchain/        Solidity contracts + Anvil config
├── docker-compose.yml Multi-service orchestration
└── TECHNICAL_DOCUMENTATION.md   Full API + architecture reference
```

## Coding Standards

### JavaScript / JSX
- **Indentation:** 4 spaces (no tabs)
- **Semicolons:** always
- **Quotes:** single quotes for strings
- **Exports:** every exported function must have a JSDoc block with `@param` and `@return`
- **Console:** use `console.error` for errors, avoid `console.log` in production code
- **Naming:** `camelCase` for variables/functions, `PascalCase` for React components

### Solidity
- Follow the existing NatSpec convention (`@title`, `@notice`, `@param`, `@return`)
- 4-space indentation
- All public functions must have documentation

### CSS / Tailwind
- Use Tailwind utility classes — no custom CSS unless unavoidable
- Component-scoped styles only

## Testing

We use **vitest** for both backend and frontend unit tests.

```bash
# Backend (no Docker required)
cd backend && npm test

# Frontend
cd frontend && npm test

# Lint
cd frontend && npm run lint
```

All tests must pass before submitting a PR. GitHub Actions CI enforces this automatically.

### Writing Tests
- Place test files in `backend/test/` or `frontend/src/__tests__/`
- Name files `*.test.js` (backend) or `*.test.jsx` (frontend)
- Mock external dependencies (database, blockchain, MediaPipe) — never hit real services in unit tests
- Use `vi.mock()` for module mocking, `vi.fn()` for function stubs

## Pull Request Process

1. **Fork** the repository and create a feature branch (`git checkout -b feat/my-feature`)
2. **Make your changes** following the coding standards above
3. **Write or update tests** for any new functionality
4. **Run the full test suite** (`npm test` in both `backend/` and `frontend/`)
5. **Run the linter** (`npm run lint` in `frontend/`)
6. **Commit** with a clear message:
   - `feat:` — new feature
   - `fix:` — bug fix
   - `docs:` — documentation only
   - `chore:` — maintenance, cleanup, tooling
   - `test:` — adding/updating tests
7. **Open a PR** against `main` with a description of what changed and why

## Reporting Issues

Open a GitHub issue with:
- A clear title and description
- Steps to reproduce (if applicable)
- Expected vs. actual behavior
- Your environment (OS, Node version, Docker version)

## Security

If you discover a security vulnerability, **do not** open a public issue. Contact the maintainers directly.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
