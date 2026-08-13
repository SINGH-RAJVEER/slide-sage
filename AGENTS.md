# AGENTS.md

Rules for AI agents in this repository.

## Package Manager

- Always use `bun` as package manager for TypeScript workspaces.

## Indentation

- Always use tab for indentation in all repository files.

## Version Control System

- Use Jusjutsu(jj) for its version control.

## Documentation updates

- Always update documentation in `/docs` after updating a feature.
- Create a new file in `/docs` only for an entirely new feature.

## Test updates

- After changes are made, update any related tests if required.
- Testing is good but endless smoke tests and regression tests for feature deletions is bad.

## UI

- Utilize shadcn UI elements wherever applicable instead of rolling out custom ones.
- Never generate any 'card within card' type of UI for this application keep it abstract and without broundaries unless specifically required.

## Don’ts

- Never use emojis in documentation or messages.
