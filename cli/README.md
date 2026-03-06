# GenSSH 🦅

> **The Agent for your Server.**
> Powered by Google Gemini 3.

GenSSH transforms your server from a passive machine into a proactive DevOps partner. Unlike traditional tools that just execute scripts, GenSSH uses high-level "Direct Intelligence" to understand your system and manage it autonomously.

## 🚀 Why GenSSH?

- **Autonomous Intelligence**: Don't waste time writing scripts. Atlas (your agent) understands your OS (Ubuntu, macOS, etc.) and executes exactly what's needed.
- **Telegram Native**: Manage your server from anywhere via a secure, interactive Telegram bot with one-touch button approvals.
- **Blueprint System**: A flexible "Playbook" approach for specialized tasks like security audits or log analysis.
- **Natural Language Cron**: "Schedule a backup of the logs folder every Sunday at midnight" — Atlas handles the rest.
- **Secure by Design**: Encrypted credential storage and explicit human-in-the-loop approvals for destructive actions.

## 📦 Installation

```bash
npm install -g genssh
```

## 🛠️ Getting Started

### 1. Initialize
Set up your agent, choose its personality, and connect your Gemini API key.
```bash
genssh init
```

### 2. Chat (Local)
Talk directly to your server through a high-def TUI.
```bash
genssh chat
```

### 3. Remote Control (Telegram)
Securely connect your agent to Telegram to manage your server while on the go.
```bash
genssh telegram setup
genssh start # Starts the background agent
```

## 📖 Key Commands

- `genssh chat` - Open the interactive terminal interface.
- `genssh status` - Real-time system health and agent status.
- `genssh ability` - Manage specialized blueprints.
- `genssh cron` - View and manage natural language schedules.
- `genssh stop` - Gracefully shut down the background agent.

## 🔧 Prerequisites

- **Node.js**: >= 18.0.0
- **Google Gemini API Key**: [Get it here](https://aistudio.google.com/)
- **Optional**: Telegram Bot Token for remote management.

---

Built with ❤️ for the Modern DevOps Engineer.
[GitHub Repository](https://github.com/divin3circle/genssh)
