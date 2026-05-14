"use client";

import { FormEvent, useMemo, useState } from "react";
import { LockKeyhole } from "lucide-react";

const APP_BASE_PATH = "/verus-monitoring";

function getAppPath(path: string) {
  return `${APP_BASE_PATH}${path}`;
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nextPath = useMemo(() => {
    if (typeof window === "undefined") {
      return getAppPath("/");
    }

    const next = new URLSearchParams(window.location.search).get("next");

    return next?.startsWith(APP_BASE_PATH) ? next : getAppPath("/");
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch(getAppPath("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Login failed.");
      setSubmitting(false);
      return;
    }

    window.location.href = nextPath;
  }

  return (
    <main className="page loginPage">
      <form className="loginPanel" onSubmit={login}>
        <div className="loginIcon">
          <LockKeyhole size={28} />
        </div>
        <h1>Administrator Login</h1>
        <p>Sign in to view the web dashboard.</p>

        {error ? <div className="notice">{error}</div> : null}

        <label>
          <span>Username</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          <span>Password</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        <button className="loadConfig" type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}
