# Contributing to GLify

Thanks for your interest in contributing to GLify! Contributions of bug fixes,
features, documentation, and design improvements are welcome.

## Getting started

1. Fork the repository and clone your fork.
2. Install the frontend dependencies with `npm install`.
3. Install the API dependencies with `npm --prefix server install`.
4. Follow the setup instructions in the [README](./README.md) for any services
   needed by your change. Never commit credentials or local `.env` files.
5. Create a focused branch for your changes.

## Development and checks

Run the frontend and API with `npm run dev:all`. Depending on the change, run
the relevant checks before opening a pull request:

```bash
npm run typecheck:server
npm run build:server
npm run build
```

Database scripts may change local or remote data. Review their behavior and
confirm your environment before running them.

## Code style

- Follow the existing TypeScript, React, and CSS patterns.
- Keep changes focused and use clear, descriptive names.
- Update documentation when behavior or setup instructions change.
- Do not commit generated build output, dependency directories, or secrets.

## Commit messages

Use a short imperative summary that describes the purpose of the change.
Examples:

- `Fix similar works API endpoint`
- `Document local development setup`
- `Add recommendations for related works`

## Pull requests

- Explain the problem and the approach in the pull request description.
- Link any related issues and include screenshots for user-facing changes.
- Confirm the applicable checks pass and note any that could not be run.
- Complete the pull request checklist.

## Reporting issues

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for
reproducible bugs and the
[feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for
proposed improvements. Do not include passwords, access tokens, or other
secrets in an issue.
