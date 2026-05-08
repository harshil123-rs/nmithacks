# n8n Multi-Agent AI Code Review — Setup Guide

## Architecture

```
Caller / n8n Webhook
       ↓
POST /api/n8n/webhook/review-code   ← Backend entry point
       ↓
Parallel AI Agents (6 specialists)
  ├── Security Agent
  ├── Bug Detection Agent
  ├── Performance Agent
  ├── Readability Agent
  ├── Best Practices Agent
  └── Documentation Agent
       ↓
Synthesizer (verdict + score)
       ↓
Discord Alert (critical)  /  Slack Alert (medium)
       ↓
SSE stream → Frontend Dashboard (/dashboard/n8n-review)
```

---

## 1. Import the Workflow into n8n Cloud

1. Go to [n8n.io](https://n8n.io) → sign in → open your workspace
2. Click **"+ New workflow"** → **"Import from file"**
3. Select `n8n/workflow.json` from this repo
4. Click **Save**

---

## 2. Set n8n Environment Variables

In n8n cloud, go to **Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `BACKEND_URL` | Your backend URL (e.g. `https://abc.ngrok.io`) |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL (optional) |
| `SLACK_WEBHOOK_URL` | Slack webhook URL (optional) |

> **Local dev tip:** Use `ngrok http 3000` to expose your local backend to n8n cloud.
> ```bash
> npx ngrok http 3000
> # copy the https URL and set it as BACKEND_URL in n8n
> ```

---

## 3. Activate the Workflow

1. Click the toggle at the top-right of the workflow editor → **Active**
2. Copy the **Webhook URL** shown on the Webhook Trigger node
   - It looks like: `https://your-instance.app.n8n.cloud/webhook/review-code`
3. Add it to `server/.env` as `N8N_WEBHOOK_URL`

---

## 4. Add Optional Notifications

### Discord
1. In Discord → Server Settings → Integrations → Webhooks → New Webhook
2. Copy the URL → set as `DISCORD_WEBHOOK_URL` in n8n environment variables

### Slack
1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create App → Incoming Webhooks
2. Copy the URL → set as `SLACK_WEBHOOK_URL` in n8n environment variables

---

## 5. Test the Webhook

```bash
curl -X POST http://localhost:3000/api/n8n/webhook/review-code \
  -H "Content-Type: application/json" \
  -d '{
    "code": "const pass = \"admin123\"; eval(userInput);",
    "language": "javascript"
  }'
```

You should see SSE events stream back, ending with `event: review:completed`.

---

## 6. Frontend Demo

1. Go to `http://localhost:5173/dashboard/n8n-review`
2. Paste any code snippet
3. Click **Run Multi-Agent Review**
4. Watch each agent card light up in real time
5. View severity-highlighted findings and the health score

---

## Demo Flow (Hackathon Script)

1. **Open** `/dashboard/n8n-review` on screen
2. **Paste** the sample code (pre-loaded with SQL injection + hardcoded password)
3. **Click** "Run Multi-Agent Review"
4. **Show** the agent cards running in parallel (Security → Bug → Performance → …)
5. **Show** the score ring animating to a low number
6. **Show** the Discord alert firing (share screen)
7. **Show** the findings: SQL injection flagged as Critical, hardcoded password Critical
8. **Explain**: "Each card is a separate AI specialist — all running in parallel via n8n orchestration"

---

## API Reference

### `POST /api/n8n/webhook/review-code`
Triggers the full multi-agent review pipeline.

**Request body:**
```json
{
  "code": "string (required)",
  "language": "typescript | javascript | python | ... (optional)",
  "filename": "review.ts (optional)",
  "context": "additional context for AI agents (optional)"
}
```

**Response:** SSE stream of events:
- `review:started` — pipeline started, returns `reviewId`
- `agent:started` — individual agent began
- `agent:completed` — agent finished, returns `findingsCount`
- `synthesizer:started` — final synthesis running
- `review:completed` — full result JSON
- `error` — something went wrong

### `GET /api/n8n/review/:id`
Fetch a previously completed review by ID.
