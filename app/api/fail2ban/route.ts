import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse, type NextRequest } from "next/server";
import { isValidAdminSessionToken } from "@/lib/admin-session";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const AUTH_COOKIE = "verus_admin_auth";
const COMMAND_TIMEOUT_MS = 8_000;
const DEFAULT_HISTORY_LINES = 240;

type CommandResult = {
  stdout: string;
  stderr: string;
};

type Fail2BanJailStatus = {
  name: string;
  currentlyFailed: number;
  totalFailed: number;
  fileList: string[];
  currentlyBanned: number;
  totalBanned: number;
  bannedIps: string[];
};

type Fail2BanHistoryItem = {
  timestamp: string;
  jail: string;
  action: "Ban" | "Unban";
  ip: string;
  line: string;
};

function shouldUseSudo() {
  return process.env.FAIL2BAN_USE_SUDO === "true";
}

async function runSystemCommand(command: string, args: string[]) {
  const useSudo = shouldUseSudo();
  const executable = useSudo ? "sudo" : command;
  const commandArgs = useSudo ? ["-n", command, ...args] : args;
  const result = await execFileAsync(executable, commandArgs, {
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });

  return result as CommandResult;
}

async function runFail2BanClient(args: string[]) {
  return runSystemCommand(process.env.FAIL2BAN_CLIENT_BIN?.trim() || "/usr/bin/fail2ban-client", args);
}

function parseJailNames(statusOutput: string) {
  const jailListLine = statusOutput.match(/Jail list:\s*(.+)/i)?.[1] ?? "";

  return jailListLine
    .split(",")
    .map((jail) => jail.trim())
    .filter(Boolean);
}

function parseStatusNumber(output: string, label: string) {
  const match = output.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));

  return match ? Number(match[1]) : 0;
}

function parseStatusList(output: string, label: string) {
  const line = output.match(new RegExp(`${label}:\\s*([^\\n\\r]*)`, "i"))?.[1] ?? "";

  return line
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseJailStatus(name: string, output: string): Fail2BanJailStatus {
  return {
    name,
    currentlyFailed: parseStatusNumber(output, "Currently failed"),
    totalFailed: parseStatusNumber(output, "Total failed"),
    fileList: parseStatusList(output, "File list"),
    currentlyBanned: parseStatusNumber(output, "Currently banned"),
    totalBanned: parseStatusNumber(output, "Total banned"),
    bannedIps: parseStatusList(output, "Banned IP list"),
  };
}

function parseHistory(logOutput: string): Fail2BanHistoryItem[] {
  return logOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+\s+\S+).*?\[([^\]]+)\]\s+(Ban|Unban)\s+(\S+)/);

      if (!match) {
        return null;
      }

      return {
        timestamp: match[1],
        jail: match[2],
        action: match[3] as "Ban" | "Unban",
        ip: match[4],
        line,
      };
    })
    .filter((item): item is Fail2BanHistoryItem => Boolean(item))
    .reverse();
}

async function loadHistory() {
  const logPath = process.env.FAIL2BAN_LOG_PATH?.trim() || "/var/log/fail2ban.log";
  const historyLines = Number(process.env.FAIL2BAN_HISTORY_LINES ?? DEFAULT_HISTORY_LINES);
  const safeHistoryLines = Number.isInteger(historyLines) && historyLines > 0 ? Math.min(historyLines, 2_000) : DEFAULT_HISTORY_LINES;
  const { stdout } = await runSystemCommand(process.env.FAIL2BAN_TAIL_BIN?.trim() || "/usr/bin/tail", ["-n", String(safeHistoryLines), logPath]);

  return parseHistory(stdout);
}

export async function GET(request: NextRequest) {
  const isAuthenticated = await isValidAdminSessionToken(request.cookies.get(AUTH_COOKIE)?.value);

  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const checkedAt = new Date().toISOString();

  try {
    const { stdout: statusOutput } = await runFail2BanClient(["status"]);
    const jailNames = parseJailNames(statusOutput);
    const jailResults = await Promise.all(
      jailNames.map(async (jailName) => {
        const { stdout } = await runFail2BanClient(["status", jailName]);

        return parseJailStatus(jailName, stdout);
      }),
    );
    const history = await loadHistory().catch(() => []);

    return NextResponse.json({
      checkedAt,
      jails: jailResults,
      history,
      totals: {
        jails: jailResults.length,
        currentlyBanned: jailResults.reduce((total, jail) => total + jail.currentlyBanned, 0),
        totalBanned: jailResults.reduce((total, jail) => total + jail.totalBanned, 0),
        currentlyFailed: jailResults.reduce((total, jail) => total + jail.currentlyFailed, 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Fail2Ban status.";

    return NextResponse.json({ checkedAt, error: message }, { status: 500 });
  }
}
