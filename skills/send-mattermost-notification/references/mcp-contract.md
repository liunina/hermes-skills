# MCP Contract: Send Mattermost Notification

## Skill

- Skill ID: `send-mattermost-notification`
- Registry file: `workflow-registry/send-mattermost-notification.json`
- MCP manager: `n8n-workflow-skills`

## Transport

The skill is executed through a private n8n webhook wrapper.

Runtime configuration:

- Environment variable: `SEND_MATTERMOST_NOTIFICATION_WEBHOOK_URL`
- Local secret file: `secrets/send-mattermost-notification.webhook-url.txt`

Do not commit the real webhook URL or Mattermost bot token.

## Input

```json
{
  "message": "Report is ready: https://wiki.example/report",
  "channelId": "",
  "baseUrl": "",
  "props": {}
}
```

## Side Effect Rule

This is an always-side-effecting component skill because it sends a real Mattermost message.

`run_workflow_skill` must reject execution unless:

```json
{
  "confirmSideEffects": true
}
```

## Expected Output

- `ok`
- `httpStatus`
- `postId`
- `channelId`
- `status`
- `message`

## Safe Smoke Test

```json
{
  "skillId": "send-mattermost-notification",
  "input": {}
}
```

Expected result:

```json
{
  "ok": false,
  "error": "side_effect_confirmation_required"
}
```

This verifies the MCP guard without calling n8n.

