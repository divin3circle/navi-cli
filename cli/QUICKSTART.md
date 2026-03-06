# GenSSH Quickstart Guide 🚀

Get up and running with your autonomous DevOps agent in minutes.

## 1. Installation

Install GenSSH globally via NPM:

```bash
npm install -g genssh
```

## 2. Initialization

Start the setup wizard to configure your agent's identity and connect your Google Gemini API key.

```bash
genssh init
```

**What you'll need:**
- A Google Gemini API Key (Get it at [aistudio.google.com](https://aistudio.google.com/))
- A name for your agent (e.g., "Friday" or "Atlas")

## 3. Local Chat (TUI)

Talk to your agent directly in your terminal. Ask it to check system health, install packages, or analyze logs.

```bash
genssh chat
```

**Try these prompts:**
- "What is the current CPU and RAM usage?"
- "Check if nginx is running correctly"
- "List the files in the current directory and explain what this project does"

## 4. Remote Remote (Telegram)

Connect your agent to Telegram to manage your server from your phone.

1. Create a bot via [@BotFather](https://t.me/botfather) and get your token.
2. Run the setup:
   ```bash
   genssh telegram setup
   ```
3. Start the agent background process:
   ```bash
   genssh start
   ```

## 5. Scheduling Tasks

Schedule any task using natural language.

```bash
# In the chat or via Telegram:
"Schedule a system update every Monday at 3 AM"
```

To view your active schedules:
```bash
genssh cron list
```

---

## 🛑 Important Security Tips

- **Sudo Access**: GenSSH will ask for your password when running `sudo` commands. It does not store this password.
- **Approvals**: For any destructive command (like `rm` or `systemctl restart`), Atlas will ask for your explicit approval.
- **Privacy**: Your API keys are stored with AES-256 encryption in `~/.genssh/config.enc.json`.
