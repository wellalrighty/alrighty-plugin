// Alrighty's plugin for Claude and ChatGPT. Assistants run local MCP servers over stdio;
// Alrighty serves Streamable HTTP on 127.0.0.1. This passes each message from one to the
// other, with the token from Alrighty's settings, so a new token in Alrighty needs no setup
// here. It uses Node's standard library only.
import { readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

/** `--dev` targets a development build of Alrighty: its own port and settings folder. */
const TARGET = process.argv.includes("--dev")
  ? { port: 47633, folder: "Alrighty Dev" }
  : { port: 47632, folder: "Alrighty" };
const ENDPOINT = `http://127.0.0.1:${TARGET.port}/mcp`;
/** Alrighty's settings.json on Mac and Linux. */
const SETTINGS =
  process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support", TARGET.folder, "settings.json")
    : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), TARGET.folder, "settings.json");
const VERSION = JSON.parse(
  readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"),
).version;
/** How often to look for Alrighty again after it didn't answer. */
const RETRY_MS = 5000;

const NOT_RUNNING =
  "Alrighty isn't open, or its connection for assistants is off. Open Alrighty and turn it on in Settings.";
/** Alrighty stamps each answer with its tool list's revision. Node lowercases header names. */
const REVISION_HEADER = "alrighty-tools";
const LIST_CHANGED = { jsonrpc: "2.0", method: "notifications/tools/list_changed" };
/** Set while Alrighty can't be reached; cleared once it answers again. */
let retry = null;
/** The tool list's revision Alrighty last answered with; empty before its first answer. */
let revision = "";

/**
 * Tells Claude to list tools again when Alrighty's revision changed since its last answer:
 * it restarted or updated between calls, or a setting changed a tool.
 */
function noteRevision(next) {
  if (!next) return;
  const changed = revision !== "" && revision !== next;
  revision = next;
  if (changed) write(LIST_CHANGED);
}

/** Read each time, so it follows Alrighty when the user makes a new token. */
function token() {
  try {
    return JSON.parse(readFileSync(SETTINGS, "utf8")).mcpToken ?? "";
  } catch {
    return "";
  }
}

/** Posts one message to Alrighty. No timeout: Alrighty times out its own window steps. */
function post(message) {
  const body = JSON.stringify(message);
  return new Promise((resolve, reject) => {
    const req = http.request(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token()}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            text: Buffer.concat(chunks).toString("utf8"),
            revision: res.headers[REVISION_HEADER] ?? "",
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const fail = (id, message) => write({ jsonrpc: "2.0", id, error: { code: -32000, message } });

/**
 * Answers for the assistant while Alrighty is closed, so the plugin still starts. It
 * offers no tools until Alrighty answers, then tells Claude the list changed.
 */
function answerOffline(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: message.params.protocolVersion,
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: "alrighty", title: "Alrighty", version: VERSION },
    };
  }
  if (message.method === "tools/list") return { tools: [] };
  return null;
}

function waitForAlrighty() {
  if (retry) return;
  retry = setInterval(() => {
    post({ jsonrpc: "2.0", id: "alrighty-ping", method: "ping" })
      .then(({ status }) => {
        if (status !== 200 || !retry) return;
        clearInterval(retry);
        retry = null;
        // Claude lists tools again now, so the next revision is a fresh start, not a change.
        revision = "";
        write(LIST_CHANGED);
      })
      .catch(() => {});
  }, RETRY_MS);
}

async function relay(message) {
  const isRequest = message.id !== undefined && typeof message.method === "string";
  let reply;
  try {
    reply = await post(message);
  } catch {
    waitForAlrighty();
    if (!isRequest) return;
    const offline = answerOffline(message);
    if (offline) return write({ jsonrpc: "2.0", id: message.id, result: offline });
    return fail(message.id, NOT_RUNNING);
  }
  if (isRequest) answer(message.id, reply);
  // After the reply, so Claude lists tools again once it has its answer.
  noteRevision(reply.revision);
}

function answer(id, reply) {
  if (reply.status !== 200) return fail(id, `Alrighty answered ${reply.status}: ${reply.text}`);
  write(JSON.parse(reply.text));
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  relay(message).catch((err) => {
    console.error("[alrighty]", err);
    if (message.id !== undefined) fail(message.id, String(err));
  });
});

process.stdin.on("end", () => process.exit(0));
