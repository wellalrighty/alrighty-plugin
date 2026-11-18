# Alrighty for Claude and ChatGPT

Connect Claude or ChatGPT to your email through [Alrighty](https://alrighty.me), the desktop
mail app for Mac and Linux. Ask "what am I waiting on?" or "draft replies to everything from
investors this week", and your assistant works from your real mail across Gmail, Outlook and IMAP.

- **Nothing goes through Alrighty's servers.** This plugin talks only to the Alrighty app on the
  same machine, over 127.0.0.1. Mail your assistant reads is sent to its company (Anthropic for
  Claude, OpenAI for ChatGPT) under your account's terms with them.
- **Your assistant only drafts.** Every email it writes opens in Alrighty for you to review, and
  only you can click Send.
- **Desktop only.** It runs on your computer, so it works in Claude's apps and Claude Code, and in
  the ChatGPT desktop app and Codex, not on chatgpt.com.

## Setup

1. Install Alrighty from https://alrighty.me and connect your mail.
2. In Alrighty, open AI assistants and turn on "Let assistants on this computer reach your mail".
3. Install this plugin in Claude, or in the ChatGPT desktop app or Codex. Node.js 18 or later must
   be installed.

## What's here

- `.mcp.json` (Claude) and `mcp.json` (ChatGPT and Codex) start `server/index.mjs`, which passes
  the assistant's requests to the Alrighty app running on your computer, using the token from
  Alrighty's own settings. It uses Node's standard library only.
- `skills/alrighty-mail` tells the assistant how to use the tools safely.

Privacy policy: https://alrighty.me/privacy. Support: support@alrighty.me.
