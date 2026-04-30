# opencode-ntfy-smart Design

## Summary

`opencode-ntfy-smart` is a standalone OpenCode notification plugin that sends iPhone push notifications through `ntfy.sh` with explicit session-aware policy.

The package will live at `/root/code/opencode-ntfy-smart` and be publishable as `opencode-ntfy-smart`.

The plugin will not depend on `opencode-notification-sdk` for event policy. Instead, it will implement its own `event({ event })` handling so the notification rules are fully owned by this package.

## Goals

- Send `ntfy.sh` notifications that work on iPhone.
- Keep the current four event types:
  - `session.idle`
  - `session.error`
  - `permission.asked`
  - `question.asked`
- Apply the exact notification policy requested by the user:
  - main sessions notify for all four events
  - subagent sessions notify only for `permission.asked` and `question.asked`
  - subagent `session.idle` and `session.error` are suppressed
- Stay close to the current `notification-ntfy.json` shape so migration is easy.
- Be small, auditable, and publishable.

## Non-Goals

- Supporting transports other than `ntfy.sh`
- Preserving compatibility with upstream `opencode-notification-sdk` internals
- Adding broader notification routing, batching, digesting, or rate-limiting
- Supporting older undocumented event names through compatibility shims

## Package Shape

The package will be a small standalone TypeScript plugin with these responsibilities:

- parse config from `notification-ntfy-smart.json`
- expose the plugin entry point used by OpenCode
- track session parentage
- classify each incoming event as main or subagent
- render titles/messages from templates
- send HTTP POST requests to `ntfy.sh`

Planned top-level structure:

- `src/index.ts`
  - plugin entry point
  - event dispatch
  - session cache management
- `src/config.ts`
  - config types
  - defaults
  - config validation/loading helpers
- `src/templates.ts`
  - render `{placeholder}` templates
  - optional shell-command template execution if configured
- `src/ntfy.ts`
  - HTTP request builder for `ntfy.sh`
- `tests/*.test.ts`
  - policy, config, template, and transport tests
- `notification-ntfy-smart.schema.json`
  - JSON schema for editor validation

## Event Policy

The plugin will treat session type as a first-class concept.

Rules:

- `session.idle`
  - main session: send
  - subagent session: suppress
- `session.error`
  - main session: send
  - subagent session: suppress
- `permission.asked`
  - main session: send
  - subagent session: send
- `question.asked`
  - main session: send
  - subagent session: send

This policy is fixed in the first version. It will not be made user-configurable yet.

Reasoning:

- the whole point of the package is to encode this exact behavior clearly
- making the policy configurable in v1 would add surface area without solving a current problem

## Session Classification

The plugin will determine whether a session is a main session or subagent by checking `parentID`.

Primary strategy:

- on `session.created`, if the session payload has `parentID`, cache that session ID as a subagent
- on `session.updated`, if the session payload has `parentID`, cache that session ID as a subagent
- on `session.deleted`, remove the cached session ID if present

Fallback strategy:

- when an event arrives with a `sessionID` that is not yet known, call `client.session.get({ path: { id: sessionID } })`
- if the returned session has `parentID`, classify it as a subagent and cache that result
- if no `parentID` is present, classify it as main

Why both:

- the cache avoids repeated lookups during normal operation
- the fallback avoids races where an event arrives before the cache has seen the lifecycle event

## Event Handling Flow

For each event:

1. Check global `enabled`.
2. Check whether that event type is enabled in config.
3. Extract `sessionID` and event metadata.
4. Classify the session as main or subagent if the event is session-scoped.
5. Apply the fixed policy table.
6. If allowed, render title/message templates.
7. Send the notification to `ntfy.sh`.
8. Swallow transport errors so notification failures never crash OpenCode.

## Config Format

The package will use `~/.config/opencode/notification-ntfy-smart.json`.

The config will intentionally mirror the current `notification-ntfy.json` shape closely.

Planned config shape:

```json
{
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true },
    "question.asked": { "enabled": true }
  },
  "backend": {
    "topic": "opencode-example-topic",
    "server": "https://ntfy.sh",
    "token": "optional",
    "priority": "default",
    "icon": {
      "mode": "dark",
      "variant": {
        "light": "https://example.com/light.png",
        "dark": "https://example.com/dark.png"
      }
    },
    "fetchTimeout": "PT10S",
    "title": {
      "session.idle": { "value": "{project}: opencode finished" },
      "session.error": { "value": "{project}: opencode error" },
      "permission.asked": { "value": "{project}: permission needed" },
      "question.asked": { "value": "{project}: response needed" }
    },
    "message": {
      "session.idle": { "value": "The agent finished and is waiting for input." },
      "session.error": { "value": "{error}" },
      "permission.asked": { "value": "Permission requested: {permission_type} {permission_patterns}" },
      "question.asked": { "value": "The agent asked a question and is waiting for your response." }
    }
  }
}
```

Compatibility decisions:

- supported event keys remain the same four keys already in use
- `backend.topic`, `server`, `token`, `priority`, `icon`, `fetchTimeout`, `title`, and `message` remain available
- template shape remains `{ value: string }` or `{ command: string }`
- config file name changes from `notification-ntfy.json` to `notification-ntfy-smart.json`

## Template Context

Template rendering will support the fields needed by the current config and the target event set.

Required placeholders:

- `{project}`
- `{session_id}`
- `{error}` for `session.error`
- `{permission_type}` for `permission.asked`
- `{permission_patterns}` for `permission.asked`
- `{question}` for `question.asked`, defined as the first question prompt when present, otherwise empty string

If a placeholder is unavailable for a given event, it resolves to an empty string.

For `question.asked`, the plugin will extract `{question}` from `properties.questions[0].question` when that field exists and is a string. It will not attempt to serialize the full multi-question payload in v1.

Command templates will be supported because the current upstream schema supports them and they are useful for advanced customization, but they are not required for the default path.

## ntfy Delivery

The backend will send direct HTTP POST requests to the configured `server/topic`.

Headers to support:

- `Title`
- `Priority`
- `Tags`
- `Authorization: Bearer ...` when `token` is configured
- `Icon` when icon resolution produces a URL

Default tag mapping:

- `session.idle` -> `hourglass_done`
- `session.error` -> `warning`
- `permission.asked` -> `lock`
- `question.asked` -> `question`

Transport failures will be caught and ignored after optional debug logging so OpenCode is never interrupted by notification delivery issues.

## OpenCode Integration

The package will be loadable from `opencode.json` as either:

- an npm package name after publish
- a local path during development

Expected local-development usage:

```json
{
  "plugin": [
    "/root/code/opencode-ntfy-smart/dist/index.js"
  ]
}
```

The published package should still be loadable by package name through normal OpenCode plugin resolution.

Expected published usage:

```json
{
  "plugin": [
    "opencode-ntfy-smart"
  ]
}
```

## Testing Strategy

The package will include automated tests for:

- config parsing and validation
- template rendering
- direct ntfy request construction
- policy enforcement for each event type
- cache-based subagent classification
- fallback `session.get()` classification

Minimum policy regression coverage:

- main `session.idle` sends
- subagent `session.idle` suppresses
- main `session.error` sends
- subagent `session.error` suppresses
- main `permission.asked` sends
- subagent `permission.asked` sends
- main `question.asked` sends
- subagent `question.asked` sends

## Migration Plan

Migration from the current setup should be simple:

1. install or point OpenCode at `opencode-ntfy-smart`
2. copy `~/.config/opencode/notification-ntfy.json` to `~/.config/opencode/notification-ntfy-smart.json`
3. update the plugin entry in `opencode.json`
4. remove the old `opencode-ntfy.sh` plugin entry once the new plugin is verified

The config field names are intentionally kept close so the user can mostly copy the existing file.

## Publishing Plan

The package will be prepared for:

- a GitHub repo at `/root/code/opencode-ntfy-smart`
- npm publication under `opencode-ntfy-smart`

The npm name appears to be currently available based on an npm registry lookup performed during design.

## Decisions

- standalone package, not a fork
- direct ntfy backend, not `opencode-notification-sdk`
- fixed main-vs-subagent policy in v1
- keep the existing four events
- keep config shape close to the current ntfy plugin
- support both cache-based and fallback lookup-based subagent detection

## Risks And Mitigations

- Risk: event ordering races cause incorrect session classification
  - Mitigation: cache lifecycle info and fall back to `client.session.get()`
- Risk: config drift from current ntfy plugin causes migration friction
  - Mitigation: preserve the current field names and template shape where practical
- Risk: ntfy delivery failures create noisy errors
  - Mitigation: catch backend send failures and keep host execution unaffected

## Initial Implementation Boundary

The first implementation will stop at:

- working standalone plugin package
- schema and config loader
- exact policy enforcement
- regression tests
- local usage in OpenCode

The first implementation will not include:

- GitHub Actions release automation
- advanced docs site
- configurable per-session-type policy matrix
- extra transports beyond ntfy
