"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Save, Search, Smartphone, X } from "lucide-react";
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

type DeviceWithComputedStatus = Device & {
  computedOnline: boolean;
};

type DeviceTab = "online" | "offline";

type ServerConfig = {
  url: string | null;
  port: string | null;
  wallet: string | null;
  password: string | null;
};

const STALE_DEVICE_MS = 60_000;
const deviceNameSorter = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function isDeviceOnline(device: Device, now: number) {
  const updatedAt = new Date(device.created_at).getTime();

  if (!device.status || Number.isNaN(updatedAt)) {
    return false;
  }

  return now - updatedAt <= STALE_DEVICE_MS;
}

function getDeviceDisplayName(device: Device) {
  return device.name?.trim() || "Unnamed phone";
}

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [query, setQuery] = useState("");
  const [deviceTab, setDeviceTab] = useState<DeviceTab>("online");
  const [now, setNow] = useState(() => Date.now());
  const [selectedConfigIndex, setSelectedConfigIndex] = useState("0");
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
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

  const loadServerConfig = useCallback(async () => {
    const response = await fetch("/api/config/dashboard", { cache: "no-store" });
    const result = (await response.json()) as { config?: ServerConfig | null; error?: string };

    if (response.ok) {
      setServerConfig(result.config ?? null);
    }
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
      await loadServerConfig();
    }

    setSavingConfig(false);
  }

  useEffect(() => {
    // Supabase is the external source of truth for this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDevices(false);
    void loadServerConfig();
  }, [loadDevices, loadServerConfig]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadDevices(false);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadDevices]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const devicesWithStatus = useMemo<DeviceWithComputedStatus[]>(
    () =>
      devices.map((device) => ({
        ...device,
        computedOnline: isDeviceOnline(device, now),
      })),
    [devices, now],
  );

  const filteredDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const tabDevices = devicesWithStatus.filter((device) =>
      deviceTab === "online" ? device.computedOnline : !device.computedOnline,
    );

    const searchedDevices = needle
      ? tabDevices.filter((device) =>
          [
            device.id,
            getDeviceDisplayName(device),
            device.hash,
            device.config,
            device.shares,
            device.cpu,
            device.temp,
            device.computedOnline ? "online" : "offline",
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle)),
        )
      : tabDevices;

    return [...searchedDevices].sort((firstDevice, secondDevice) => {
      const nameComparison = deviceNameSorter.compare(
        getDeviceDisplayName(firstDevice),
        getDeviceDisplayName(secondDevice),
      );

      if (nameComparison !== 0) {
        return nameComparison;
      }

      return firstDevice.id - secondDevice.id;
    });
  }, [devicesWithStatus, deviceTab, query]);

  const onlineCount = devicesWithStatus.filter((device) => device.computedOnline).length;
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

            <section className="currentConfig" aria-label="Current server config">
              <div className="currentConfigHeader">
                <span>Current Server Config</span>
                <button onClick={() => void loadServerConfig()} aria-label="Refresh current config">
                  <RefreshCw size={15} />
                </button>
              </div>

              {serverConfig ? (
                <dl className="configPreview">
                  <div>
                    <dt>URL</dt>
                    <dd>{serverConfig.url || "-"}</dd>
                  </div>
                  <div>
                    <dt>Port</dt>
                    <dd>{serverConfig.port || "-"}</dd>
                  </div>
                  <div>
                    <dt>Wallet</dt>
                    <dd>{serverConfig.wallet || "-"}</dd>
                  </div>
                  <div>
                    <dt>Password</dt>
                    <dd>{serverConfig.password || "-"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="configMessage">No server config loaded.</p>
              )}
            </section>

            <div className="toolbar">
              <label className="search">
                <Search size={18} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search devices"
                  aria-label="Search devices"
                />
                {query ? (
                  <button
                    type="button"
                    className="clearSearch"
                    onClick={() => setQuery("")}
                    aria-label="Clear device search"
                    title="Clear search"
                  >
                    <X size={16} />
                  </button>
                ) : null}
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

            <div className="tabs" role="tablist" aria-label="Device status">
              <button
                className={`tab ${deviceTab === "online" ? "active" : ""}`}
                onClick={() => setDeviceTab("online")}
                role="tab"
                aria-selected={deviceTab === "online"}
              >
                Online {onlineCount}
              </button>
              <button
                className={`tab ${deviceTab === "offline" ? "active" : ""}`}
                onClick={() => setDeviceTab("offline")}
                role="tab"
                aria-selected={deviceTab === "offline"}
              >
                Offline {offlineCount}
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
                        {query.trim() ? "No devices match your search." : "No devices found."}
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((device) => (
                      <tr key={device.id}>
                        <td>
                          <div className="deviceName">
                            <strong>{getDeviceDisplayName(device)}</strong>
                            <span>
                              <Smartphone size={13} aria-hidden="true" /> ID {device.id}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`status ${device.computedOnline ? "online" : "offline"}`}>
                            <span className="dot" aria-hidden="true" />
                            {device.computedOnline ? "Online" : "Offline"}
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
