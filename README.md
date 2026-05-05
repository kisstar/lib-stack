# lib-stack

A monorepo of utility packages built with TypeScript and Rolldown.

## Packages

| Package | Description |
|---------|-------------|
| [@lib-stack/shared](./packages/shared) | Common utility functions |
| [@lib-stack/logger](./packages/logger) | A lightweight logger with configurable log levels |
| [@lib-stack/scheduler](./packages/scheduler) | A lightweight task scheduler |
| [@lib-stack/iframe-events](./packages/iframe-events) | Type-safe communication library for multi-level iframe trees |

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 10

### Install

```bash
pnpm install
```

### Development

```bash
# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Lint with auto-fix
pnpm lint:fix

# Type check
pnpm typecheck
```

### Publishing

```bash
# 1. Create a changeset to describe your changes
pnpm changeset

# 2. Bump versions and generate CHANGELOG.md
pnpm version-packages

# 3. Commit the version changes
git add . && git commit -m "chore: version packages"

# 4. Build and publish to npm
pnpm release
```

## License

MIT
