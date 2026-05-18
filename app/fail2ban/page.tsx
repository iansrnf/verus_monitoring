"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, Clock3, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { LogoutButton } from "@/app/components/LogoutButton";

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

type Fail2BanResponse = {
  checkedAt?: string;
  jails?: Fail2BanJailStatus[];
  history?: Fail2BanHistoryItem[];
  totals?: {
    jails: number;
    currentlyBanned: number;
    totalBanned: number;
    currentlyFailed: number;
  };
  error?: string;
};

const APP_BASE_PATH = "/verus-monitoring";

function getAppPath(path: string) {
  return `${APP_BASE_PATH}${path}`;
}

function formatDate(value: string | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function Fail2BanPage() {
  const [data, setData] = useState<Fail2BanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFail2Ban = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const response = await fetch(getAppPath("/api/fail2ban"), { cache: "no-store" });
      const result = (await response.json()) as Fail2BanResponse;

      if (!response.ok) {
        setError(result.error ?? "Failed to load Fail2Ban status.");
      } else {
        setData(result);
        setError(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Fail2Ban status.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // The Ubuntu service is the external source of truth for this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFail2Ban();
  }, [loadFail2Ban]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadFail2Ban(false);
    }, 10_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadFail2Ban]);

  const history = data?.history ?? [];
  const totals = data?.totals ?? {
    jails: 0,
    currentlyBanned: 0,
    totalBanned: 0,
    currentlyFailed: 0,
  };
  const sortedJails = useMemo(
    () =>
      [...(data?.jails ?? [])].sort((firstJail, secondJail) => {
        const bannedComparison = secondJail.currentlyBanned - firstJail.currentlyBanned;

        return bannedComparison || firstJail.name.localeCompare(secondJail.name);
      }),
    [data?.jails],
  );

  return (
    <main className="page">
      <div className="shell">
        <Link className="backLink" href="/">
          <ArrowLeft size={16} />
          Device Dashboard
        </Link>

        <header className="topbar">
          <div className="titleBlock">
            <h1>Fail2Ban Monitor</h1>
            <p>Ubuntu jail status, active bans, and recent ban history.</p>
            <LogoutButton />
          </div>

          <div className="summary" aria-label="Fail2Ban summary">
            <div className="metric">
              <span>Jails</span>
              <strong>{totals.jails}</strong>
            </div>
            <div className={`metric ${totals.currentlyBanned > 0 ? "negativeMetric" : "positiveMetric"}`}>
              <span>Active Bans</span>
              <strong>{totals.currentlyBanned}</strong>
            </div>
            <div className="metric">
              <span>Total Bans</span>
              <strong>{totals.totalBanned}</strong>
            </div>
            <div className={`metric ${totals.currentlyFailed > 0 ? "negativeMetric" : ""}`}>
              <span>Failed Now</span>
              <strong>{totals.currentlyFailed}</strong>
            </div>
          </div>
        </header>

        <section className="fail2banToolbar" aria-label="Fail2Ban actions">
          <span>
            <Clock3 size={15} aria-hidden="true" />
            Last check {formatDate(data?.checkedAt)}
          </span>
          <button className="loadConfig" type="button" onClick={() => void loadFail2Ban()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {error ? <div className="notice">{error}</div> : null}

        <section className="fail2banGrid" aria-label="Fail2Ban jails">
          {loading && !data ? (
            <div className="empty">Loading Fail2Ban status...</div>
          ) : sortedJails.length === 0 ? (
            <div className="empty">No Fail2Ban jails found.</div>
          ) : (
            sortedJails.map((jail) => (
              <article className={`fail2banJail ${jail.currentlyBanned > 0 ? "hasBans" : ""}`} key={jail.name}>
                <div className="fail2banJailHeader">
                  <span>
                    {jail.currentlyBanned > 0 ? <ShieldAlert size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
                    <strong>{jail.name}</strong>
                  </span>
                  <strong>{jail.currentlyBanned} banned</strong>
                </div>

                <dl className="fail2banStats">
                  <div>
                    <dt>Failed</dt>
                    <dd>{jail.currentlyFailed}</dd>
                  </div>
                  <div>
                    <dt>Total Failed</dt>
                    <dd>{jail.totalFailed}</dd>
                  </div>
                  <div>
                    <dt>Total Banned</dt>
                    <dd>{jail.totalBanned}</dd>
                  </div>
                </dl>

                <div className="fail2banIpList" aria-label={`${jail.name} banned IPs`}>
                  {jail.bannedIps.length > 0 ? jail.bannedIps.map((ip) => <span key={ip}>{ip}</span>) : <small>No active banned IPs</small>}
                </div>
              </article>
            ))
          )}
        </section>

        <section className="fail2banHistory" aria-label="Fail2Ban history">
          <div className="sectionHeader">
            <div>
              <h2>Recent History</h2>
              <p>Latest Ban and Unban events from the Fail2Ban log.</p>
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Jail</th>
                  <th>Action</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="emptyCell">
                      No recent ban history found.
                    </td>
                  </tr>
                ) : (
                  history.map((item) => (
                    <tr key={item.line}>
                      <td className="muted">{item.timestamp}</td>
                      <td>{item.jail}</td>
                      <td>
                        <span className={`fail2banAction ${item.action === "Ban" ? "ban" : "unban"}`}>
                          <Ban size={13} aria-hidden="true" />
                          {item.action}
                        </span>
                      </td>
                      <td className="mono">{item.ip}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
