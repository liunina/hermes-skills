---
name: send-mattermost-notification
description: Send Mattermost notifications through a registered n8n workflow skill. Use when an agent needs to notify a Mattermost channel after an analysis, report publication, workflow completion, or operational event. This is a side-effecting component skill and requires explicit user approval before execution.
metadata:
  hermes:
    version: 0.1.0
    author: liunina
    tags: [mattermost, notification, chatops, n8n, workflow]
    category: notification
---

# Send Mattermost Notification

Use the `n8n-workflow-skills` MCP manager to send a Mattermost notification through n8n.

This is a component skill. It can be reused by business skills that need to notify a team after publishing a report or completing a workflow.

## Invocation

1. Call `get_workflow_skill` with `skillId: "send-mattermost-notification"` before first use in a session.
2. Call `run_workflow_skill` with `skillId: "send-mattermost-notification"`.
3. Always pass `confirmSideEffects: true` only after the user explicitly approves sending the notification.

## Required Inputs

The backing workflow wrapper should accept these fields:

- `message`: Mattermost post body.

Optional fields:

- `channelId`: Override channel id. Leave empty to use workflow default.
- `baseUrl`: Override Mattermost base URL. Leave empty to use workflow default.
- `props`: Optional Mattermost post properties.

## Example

```json
{
  "skillId": "send-mattermost-notification",
  "input": {
    "message": "Amazon competitor report is ready: https://wiki.example/report",
    "channelId": "",
    "props": {}
  },
  "confirmSideEffects": true
}
```

## Side Effects

This skill sends a real Mattermost message. The MCP manager must reject execution unless `confirmSideEffects: true` is supplied.

Never print or store Mattermost bot tokens, webhook URLs, or credential values.

## Output

Return:

- `ok`: success boolean.
- `postId`: created Mattermost post id.
- `channelId`: Mattermost channel id.
- `status`: notification status.
- `message`: diagnostic message.

