"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Search, Smartphone, X } from "lucide-react";
import { LogoutButton } from "@/app/components/LogoutButton";

type EarnAppDevice = {
  [key: string]: unknown;
  uuid: string;
  title: string;
  rate: number;
  earned: number;
  earned_total: number;
  country: string;
  ips: string[];
  billing: string;
  uptime: number;
  total_uptime: number;
  raw?: unknown;
};

const APP_BASE_PATH = "/verus-monitoring";

function getAppPath(path: string) {
  return `${APP_BASE_PATH}${path}`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatUptime(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "offline";
  }

  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function isEarnAppDeviceActive(device: EarnAppDevice) {
  return device.uptime > 0 || device.earned > 0;
}

function getDeviceSearchText(device: EarnAppDevice) {
  return JSON.stringify(device.raw ?? device).toLowerCase();
}

export default function EarnAppDevicesPage() {
  const [cookie, setCookie] = useState("");
  const [devices, setDevices] = useState<EarnAppDevice[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadEarnAppDevices() {
    const pastedCookie = cookie.trim();

    if (!pastedCookie) {
      setError("Paste your EarnApp cookie header or cookies.json export first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getAppPath("/api/earnapp/devices"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: pastedCookie }),
      });
      const result = (await response.json()) as { checkedAt?: string; devices?: EarnAppDevice[]; error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to load EarnApp devices.");
      }

      setDevices(result.devices ?? []);
      setCheckedAt(result.checkedAt ?? new Date().toISOString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load EarnApp devices.");
    } finally {
      setLoading(false);
    }
  }

  const filteredDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return devices;
    }

    return devices.filter((device) =>
      [
        device.title,
        device.uuid,
        device.country,
        device.billing,
        device.rate,
        device.earned,
        device.earned_total,
        formatUptime(device.uptime),
        formatUptime(device.total_uptime),
        ...device.ips,
        isEarnAppDeviceActive(device) ? "active" : "offline",
      ].some((value) => String(value).toLowerCase().includes(needle)) || getDeviceSearchText(device).includes(needle),
    );
  }, [devices, query]);

  const activeCount = devices.filter(isEarnAppDeviceActive).length;
  const earned = devices.reduce((total, device) => total + device.earned, 0);
  const earnedTotal = devices.reduce((total, device) => total + device.earned_total, 0);
  const zeroEarnedCount = devices.filter((device) => device.earned <= 0).length;

  return (
    <main className="page">
      <div className="shell">
        <Link className="backLink" href="/">
          <ArrowLeft size={16} />
          Device Dashboard
        </Link>

        <header className="topbar">
          <div className="titleBlock">
            <h1>EarnApp Devices</h1>
            <p>Load and search every EarnApp device, including zero-earned devices.</p>
            <LogoutButton />
          </div>

          <div className="summary" aria-label="EarnApp summary">
            <div className="metric">
              <span>Total</span>
              <strong>{devices.length}</strong>
            </div>
            <div className="metric">
              <span>Active</span>
              <strong>{activeCount}</strong>
            </div>
            <div className="metric">
              <span>Zero Earned</span>
              <strong>{zeroEarnedCount}</strong>
            </div>
            <div className="metric hashMetric">
              <span>Earned</span>
              <strong>{formatUsd(earned)}</strong>
            </div>
          </div>
        </header>

        <section className="earnAppPanel" aria-label="EarnApp cookie loader">
          <div className="earnAppHeader">
            <div>
              <span>EarnApp API</span>
              <strong>Paste cookie or exported cookies JSON</strong>
            </div>
            <button className="loadConfig" type="button" onClick={() => void loadEarnAppDevices()} disabled={loading || !cookie.trim()}>
              <RefreshCw size={17} />
              {loading ? "Loading..." : "Load Devices"}
            </button>
          </div>

          <label className="earnAppCookieField">
            <span>Cookie or JSON export</span>
            <textarea
              value={cookie}
              onChange={(event) => setCookie(event.target.value)}
              placeholder="Paste the full Cookie header, or the exported cookies.json array"
              spellCheck={false}
              aria-label="EarnApp cookie"
            />
          </label>

          <div className="earnAppMetrics">
            <div>
              <span>Total Earned</span>
              <strong>{formatUsd(earnedTotal)}</strong>
            </div>
            <div>
              <span>Visible</span>
              <strong>{filteredDevices.length}</strong>
            </div>
            <div>
              <span>Countries</span>
              <strong>{new Set(devices.map((device) => device.country).filter(Boolean)).size}</strong>
            </div>
            <div>
              <span>Last Check</span>
              <strong>{checkedAt ? formatDate(checkedAt) : "-"}</strong>
            </div>
          </div>

          {error ? <div className="notice">{error}</div> : null}
        </section>

        <div className="toolbar">
          <label className="search">
            <Search size={18} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search EarnApp devices" aria-label="Search EarnApp devices" />
            {query ? (
              <button type="button" className="clearSearch" onClick={() => setQuery("")} aria-label="Clear EarnApp search" title="Clear search">
                <X size={16} />
              </button>
            ) : null}
          </label>
        </div>

        <section className="tableWrap earnAppTable" aria-label="EarnApp devices">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Country</th>
                <th>Uptime</th>
                <th>Total Uptime</th>
                <th>Rate</th>
                <th>Earned</th>
                <th>Total</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && devices.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={9}>
                    Loading EarnApp devices...
                  </td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={9}>
                    {devices.length > 0 ? "No EarnApp devices match your search." : "Paste a cookie and load devices."}
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device, index) => {
                  const active = isEarnAppDeviceActive(device);

                  return (
                    <tr key={device.uuid || `${device.title}-${index}`}>
                      <td>
                        <div className="deviceName">
                          <strong>{device.title}</strong>
                          <span>
                            <Smartphone size={13} aria-hidden="true" /> {device.uuid}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`status ${active ? "online" : "offline"}`}>
                          <span className="dot" aria-hidden="true" />
                          {active ? "Active" : "Offline"}
                        </span>
                      </td>
                      <td>{device.country.toUpperCase() || "-"}</td>
                      <td className="mono">{formatUptime(device.uptime)}</td>
                      <td className="mono">{formatUptime(device.total_uptime)}</td>
                      <td className="mono">${device.rate}</td>
                      <td className="mono">{formatUsd(device.earned)}</td>
                      <td className="mono">{formatUsd(device.earned_total)}</td>
                      <td className="mono" title={device.ips.join(", ")}>
                        {device.ips[0] ?? "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
