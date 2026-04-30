# opencode-ntfy-smart

`opencode-ntfy-smart` is a standalone OpenCode plugin that sends `ntfy.sh` push notifications with smart filtering for main sessions and subagents.

It keeps the four supported notification events while reducing subagent noise:

| Event | Main session | Subagent |
| --- | --- | --- |
| `session.idle` | notify | suppress |
| `session.error` | notify | suppress |
| `permission.asked` | notify | notify |
| `question.asked` | notify | notify |

## Install

```bash
npm install opencode-ntfy-smart
```

## Local Development

```bash
npm install
npm run build
```

Use the local OpenCode plugin build at `/root/code/opencode-ntfy-smart/dist/index.js`.

Example OpenCode plugin configuration:

```json
{
  "plugin": [
    "/root/code/opencode-ntfy-smart/dist/index.js"
  ]
}
```

## Configuration

Create the config file at `~/.config/opencode/notification-ntfy-smart.json`.

```json
{
  "$schema": "https://raw.githubusercontent.com/antctt/opencode-ntfy-smart/main/notification-ntfy-smart.schema.json",
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
    "priority": "default",
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
      "question.asked": { "value": "{question}" }
    }
  }
}
```

## Publish

```bash
npm pack
npm publish
```
