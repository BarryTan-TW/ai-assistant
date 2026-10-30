# ai-assistant
Essential AI Agent Skills for Daily Tasks

## AI mobile team agents
`.github/agents/` contains a virtual product team (orchestrator, product-owner, ux-ui-designer, qa-tdd-tester, android-developer, ios-developer), all on `claude-opus-5.5`. See [docs/agent-flow.md](docs/agent-flow.md) for the workflow.

## ai-assistant-bot (chat UI, Ubuntu)
A local web chat app for talking to these agents. Each conversation is a resumable GitHub Copilot CLI session, so the bot remembers context and asks follow-up questions about your project and spec.

### Requirements
- Node.js 18+
- GitHub Copilot CLI installed and signed in (`copilot login`)

### Run
```bash
./app/bin/ai-assistant-bot      # starts http://127.0.0.1:4317 and opens your browser
# or
cd app && npm start
```

Optional: add it to the Ubuntu app menu.
```bash
./app/install-desktop.sh
```

### Use
1. Pick a teammate (default **product-owner**).
2. Click **📂 Choose project** to set the project the agents work in:
   - **Folder on this computer**: browse to a folder or type a path (`/…` or `~/…`).
   - **GitHub URL**: `https://github.com/owner/repo`, `git@github.com:owner/repo.git` or `owner/repo`. Other git hosts also work. The repo is cloned into `BOT_REPOS_DIR` with `gh repo clone` (or `git clone`) and updated with `git pull --ff-only` on later picks. Private repos need `gh auth login`.

   Each conversation remembers its project, and the team's agents load via `--add-dir`. Changing the project of a started conversation opens a new one. Recent projects are listed for one-click reuse.
3. Describe your idea.
4. Answer the bot's follow-up questions.
5. Switch teammate at any time by clicking another role. The same conversation (and its context) continues.
6. Or pick **👥 Group discussion**: each expert (PO → UX/UI → QA → Android → iOS) replies in turn to your question in the same session, so they build on each other. Experts with nothing to add reply `PASS`, which is hidden. The project manager (`orchestrator`) then summarises and lists the key questions for you.
7. Click **💾 Save spec** to write `docs/features/<name>/spec.md` in the chosen project. In group mode the product owner writes it.

Grey text next to **🗑 Delete** shows the AI credits (AIC) spent by the latest reply (summed over all members in group mode) and by the whole conversation, from copilot's `--usage-output-file`. It also shows the remaining monthly AIC from `gh api /copilot_internal/user`, which needs `gh auth login` and can lag a little behind.

The UI is senior-friendly: Traditional Chinese by default (English toggle), a ❓ step-by-step tutorial (shown on first visit, replay any time), adjustable text size (default 18px), high-contrast light/dark themes, big labelled buttons, and 🔊 read-aloud for replies. The bot replies in the user's language using plain words.

### Configuration (env vars)
| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4317` | HTTP port (bound to 127.0.0.1 only) |
| `BOT_MODEL` | `claude-opus-5.5` | Model passed to `copilot --model` |
| `BOT_WORKDIR` | repo root | Default project folder (until you choose one in the UI) |
| `BOT_REPOS_DIR` | `~/ai-assistant-bot/repos` | Where GitHub/remote projects are cloned |
| `BOT_ALLOW_ALL` | unset | Set to `1` to allow all tools, including shell. By default agents can read and write files but cannot run shell commands. |
| `COPILOT_BIN` | `copilot` | Path to the Copilot CLI |

Conversations are stored in the browser's localStorage. The server only accepts requests addressed to `127.0.0.1`/`localhost`, and only JSON POSTs, so other websites can't drive it.

### Test
```bash
cd app && npm test
```
