"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Save, Search, Smartphone } from "lucide-react";
import { miningConfigs } from "@/lib/configs";

type Device = {
  id: number;
  created_at: string;
  name: string | null;
  hash: string | null;
  config: string | null;
  shares: string | null;
  cpu: number | null;
  temp: string | null;
  status: boolean | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [query, setQuery] = useState("");
  const [selectedConfigIndex, setSelectedConfigIndex] = useState("0");
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  const loadDevices = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    const response = await fetch("/api/devices", { cache: "no-store" });
    const result = (await response.json()) as { devices?: Device[]; error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to load devices.");
    } else {
      setError(null);
      setDevices(result.devices ?? []);
    }

    setLoading(false);
  }, []);

  async function loadSelectedConfig() {
    const selectedConfig = miningConfigs[Number(selectedConfigIndex)];

    setSavingConfig(true);
    setConfigMessage(null);

    const response = await fetch("/api/config/load", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ configIndex: Number(selectedConfigIndex) }),
    });

    const result = (await response.json()) as { config?: string; error?: string };

    if (!response.ok) {
      setConfigMessage(result.error ?? "Failed to load config.");
    } else {
      setConfigMessage(`Loaded config: ${selectedConfig.label}`);
    }

    setSavingConfig(false);
  }

  useEffect(() => {
    // Supabase is the external source of truth for this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDevices(false);
  }, [loadDevices]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadDevices(false);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadDevices]);

  const filteredDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return devices;
    }

    return devices.filter((device) =>
      [
        device.id,
        device.name,
        device.hash,
        device.config,
        device.shares,
        device.cpu,
        device.temp,
        device.status ? "online" : "offline",
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [devices, query]);

  const onlineCount = devices.filter((device) => device.status).length;
  const offlineCount = devices.length - onlineCount;

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <div className="titleBlock">
            <h1>Verus Device Monitor</h1>
            <p>Live Supabase view for installed phones and miner config.</p>
          </div>

          <div className="summary" aria-label="Device summary">
            <div className="metric">
              <span>Total</span>
              <strong>{devices.length}</strong>
            </div>
            <div className="metric">
              <span>Online</span>
              <strong>{onlineCount}</strong>
            </div>
            <div className="metric">
              <span>Offline</span>
              <strong>{offlineCount}</strong>
            </div>
          </div>
        </header>

        <>
            <section className="configPanel" aria-label="Mining config loader">
              <div className="configControls">
                <label className="selectWrap">
                  <span>Config</span>
                  <select
                    value={selectedConfigIndex}
                    onChange={(event) => {
                      setSelectedConfigIndex(event.target.value);
                      setConfigMessage(null);
                    }}
                  >
                    {miningConfigs.map((config, index) => (
                      <option key={config.label} value={index}>
                        {config.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button className="loadConfig" onClick={() => void loadSelectedConfig()} disabled={savingConfig}>
                  <Save size={17} />
                  {savingConfig ? "Loading..." : "Load Config"}
                </button>
              </div>

              <dl className="configPreview">
                <div>
                  <dt>URL</dt>
                  <dd>{miningConfigs[Number(selectedConfigIndex)].url}</dd>
                </div>
                <div>
                  <dt>Port</dt>
                  <dd>{miningConfigs[Number(selectedConfigIndex)].port}</dd>
                </div>
                <div>
                  <dt>Wallet</dt>
                  <dd>{miningConfigs[Number(selectedConfigIndex)].wallet}</dd>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd>{miningConfigs[Number(selectedConfigIndex)].password || "-"}</dd>
                </div>
              </dl>

              {configMessage ? <p className="configMessage">{configMessage}</p> : null}
            </section>

            <div className="toolbar">
              <label className="search">
                <Search size={18} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search device, hash, config, or status"
                  aria-label="Search devices"
                />
              </label>

              <button
                className="refresh"
                onClick={() => void loadDevices()}
                aria-label="Refresh devices"
                title="Refresh devices"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {error ? <div className="notice">{error}</div> : null}

            <section className="tableWrap" aria-label="Devices">
              <table>
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Status</th>
                    <th>Hash</th>
                    <th>Shares</th>
                    <th>CPU</th>
                    <th>Temp</th>
                    <th>Config</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="empty" colSpan={8}>
                        Loading devices...
                      </td>
                    </tr>
                  ) : filteredDevices.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={8}>
                        No devices found.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((device) => (
                      <tr key={device.id}>
                        <td>
                          <div className="deviceName">
                            <strong>{device.name || "Unnamed phone"}</strong>
                            <span>
                              <Smartphone size={13} aria-hidden="true" /> ID {device.id}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`status ${device.status ? "online" : "offline"}`}>
                            <span className="dot" aria-hidden="true" />
                            {device.status ? "Online" : "Offline"}
                          </span>
                        </td>
                        <td className="mono" title={device.hash ?? ""}>
                          {device.hash || "-"}
                        </td>
                        <td className="mono" title={device.shares ?? ""}>
                          {device.shares || "0/0 shares"}
                        </td>
                        <td className="mono">{device.cpu ?? 0} cores</td>
                        <td className="mono" title={device.temp ?? ""}>
                          {device.temp || "-"}
                        </td>
                        <td className="config" title={device.config ?? ""}>
                          <Activity size={14} aria-hidden="true" /> {device.config || "-"}
                        </td>
                        <td className="muted">{formatDate(device.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
        </>
      </div>
    </main>
  );
}
