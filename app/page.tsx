"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Save, Search, Smartphone, X } from "lucide-react";
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
  lastSeenAt: number | null;
  statusLabel: string;
};

type DeviceTab = "online" | "offline" | "recent";
type SortDirection = "asc" | "desc";
type SortKey = "device" | "status" | "hash" | "shares" | "cpu" | "temp" | "config" | "created";

type SortState = {
  key: SortKey;
  direction: SortDirection;
};

type ServerConfig = {
  url: string | null;
  port: string | null;
  wallet: string | null;
  password: string | null;
};

const STALE_DEVICE_MS = 60_000;
const RECENT_OFFLINE_MS = 24 * 60 * 60 * 1000;
const deviceNameSorter = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const hashRateFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
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

function getDeviceLastSeenAt(device: Device) {
  const lastSeenAt = new Date(device.created_at).getTime();

  return Number.isNaN(lastSeenAt) ? null : lastSeenAt;
}

function formatRelativeTime(from: number | null, now: number) {
  if (from === null) {
    return "unknown time ago";
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - from) / 1000));

  if (elapsedSeconds < 60) {
    return "just now";
  }

  const units = [
    { label: "day", seconds: 86_400 },
    { label: "hour", seconds: 3_600 },
    { label: "minute", seconds: 60 },
  ];

  const unit = units.find((item) => elapsedSeconds >= item.seconds) ?? units[units.length - 1];
  const value = Math.floor(elapsedSeconds / unit.seconds);

  return `${value} ${unit.label}${value === 1 ? "" : "s"} ago`;
}

function formatHashRate(value: string | null) {
  const hashRate = getHashRateValue(value);

  if (hashRate === null) {
    return "-";
  }

  const digitCount = Math.floor(Math.abs(hashRate)).toString().length;

  if (digitCount >= 10) {
    return `${hashRateFormatter.format(hashRate / 1_000_000_000)} GH/s`;
  }

  if (digitCount >= 7) {
    return `${hashRateFormatter.format(hashRate / 1_000_000)} MH/s`;
  }

  if (digitCount >= 4) {
    return `${hashRateFormatter.format(hashRate / 1_000)} KH/s`;
  }

  return `${hashRateFormatter.format(hashRate)} H/s`;
}

function formatHashRateValue(hashRate: number) {
  return formatHashRate(String(hashRate));
}

function getHashRateValue(value: string | null) {
  const normalizedValue = value?.trim().replace(/,/g, "");

  if (!normalizedValue) {
    return null;
  }

  const numericMatch = normalizedValue.match(/-?\d+(\.\d+)?/);

  if (!numericMatch) {
    return null;
  }

  const numericValue = Number(numericMatch[0]);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const unitMatch = normalizedValue.match(/\b([kmg])h\/?s\b/i);
  const unit = unitMatch?.[1]?.toLowerCase();

  if (unit === "g") {
    return numericValue * 1_000_000_000;
  }

  if (unit === "m") {
    return numericValue * 1_000_000;
  }

  if (unit === "k") {
    return numericValue * 1_000;
  }

  return numericValue;
}

function getNumberFromText(value: string | null) {
  const match = value?.replace(/,/g, "").match(/-?\d+(\.\d+)?/);

  if (!match) {
    return null;
  }

  const numericValue = Number(match[0]);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function compareText(firstValue: string | null, secondValue: string | null) {
  return deviceNameSorter.compare(firstValue?.trim() || "", secondValue?.trim() || "");
}

function compareNumbers(firstValue: number | null, secondValue: number | null) {
  if (firstValue === null && secondValue === null) {
    return 0;
  }

  if (firstValue === null) {
    return 1;
  }

  if (secondValue === null) {
    return -1;
  }

  return firstValue - secondValue;
}

function compareDevices(firstDevice: DeviceWithComputedStatus, secondDevice: DeviceWithComputedStatus, key: SortKey) {
  switch (key) {
    case "device":
      return compareText(getDeviceDisplayName(firstDevice), getDeviceDisplayName(secondDevice));
    case "status":
      return Number(firstDevice.computedOnline) - Number(secondDevice.computedOnline);
    case "hash":
      return compareNumbers(getHashRateValue(firstDevice.hash), getHashRateValue(secondDevice.hash));
    case "shares":
      return compareText(firstDevice.shares, secondDevice.shares);
    case "cpu":
      return compareNumbers(firstDevice.cpu ?? null, secondDevice.cpu ?? null);
    case "temp": {
      const numericComparison = compareNumbers(getNumberFromText(firstDevice.temp), getNumberFromText(secondDevice.temp));

      return numericComparison || compareText(firstDevice.temp, secondDevice.temp);
    }
    case "config":
      return compareText(firstDevice.config, secondDevice.config);
    case "created":
      return compareNumbers(firstDevice.lastSeenAt, secondDevice.lastSeenAt);
    default:
      return 0;
  }
}

function isRecentlyOffline(device: DeviceWithComputedStatus, now: number) {
  return !device.computedOnline && device.lastSeenAt !== null && now - device.lastSeenAt <= RECENT_OFFLINE_MS;
}

function getDeviceDisplayName(device: Device) {
  return device.name?.trim() || "Unnamed phone";
}

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [query, setQuery] = useState("");
  const [deviceTab, setDeviceTab] = useState<DeviceTab>("online");
  const [sort, setSort] = useState<SortState>({ key: "device", direction: "asc" });
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

  function toggleSort(key: SortKey) {
    setSort((currentSort) => ({
      key,
      direction: currentSort.key === key && currentSort.direction === "asc" ? "desc" : "asc",
    }));
  }

  function renderSortIcon(key: SortKey) {
    if (sort.key !== key) {
      return <ArrowUpDown size={14} aria-hidden="true" />;
    }

    return sort.direction === "asc" ? (
      <ArrowUp size={14} aria-hidden="true" />
    ) : (
      <ArrowDown size={14} aria-hidden="true" />
    );
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
      devices.map((device) => {
        const computedOnline = isDeviceOnline(device, now);
        const lastSeenAt = getDeviceLastSeenAt(device);

        return {
          ...device,
          computedOnline,
          lastSeenAt,
          statusLabel: computedOnline ? "Online" : `offline ${formatRelativeTime(lastSeenAt, now)}`,
        };
      }),
    [devices, now],
  );

  const filteredDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const tabDevices = devicesWithStatus.filter((device) => {
      if (deviceTab === "online") {
        return device.computedOnline;
      }

      if (deviceTab === "recent") {
        return isRecentlyOffline(device, now);
      }

      return !device.computedOnline;
    });

    const searchedDevices = needle
      ? tabDevices.filter((device) =>
          [
            device.id,
            getDeviceDisplayName(device),
            device.hash,
            formatHashRate(device.hash),
            device.config,
            device.shares,
            device.cpu,
            device.temp,
            device.statusLabel,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle)),
        )
      : tabDevices;

    return [...searchedDevices].sort((firstDevice, secondDevice) => {
      const comparison = compareDevices(firstDevice, secondDevice, sort.key);
      const directionMultiplier = sort.direction === "asc" ? 1 : -1;

      return comparison ? comparison * directionMultiplier : firstDevice.id - secondDevice.id;
    });
  }, [devicesWithStatus, deviceTab, now, query, sort]);

  const onlineCount = devicesWithStatus.filter((device) => device.computedOnline).length;
  const offlineCount = devices.length - onlineCount;
  const recentOfflineCount = devicesWithStatus.filter((device) => isRecentlyOffline(device, now)).length;
  const onlineHashTotal = devicesWithStatus.reduce((total, device) => {
    if (!device.computedOnline) {
      return total;
    }

    return total + (getHashRateValue(device.hash) ?? 0);
  }, 0);

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
            <div className="metric">
              <span>Total Hash</span>
              <strong>{formatHashRateValue(onlineHashTotal)}</strong>
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
              <button
                className={`tab ${deviceTab === "recent" ? "active" : ""}`}
                onClick={() => setDeviceTab("recent")}
                role="tab"
                aria-selected={deviceTab === "recent"}
              >
                Recent {recentOfflineCount}
              </button>
            </div>

            {error ? <div className="notice">{error}</div> : null}

            <section className="tableWrap" aria-label="Devices">
              <table>
                <thead>
                  <tr>
                    <th aria-sort={sort.key === "device" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className="sortHeader" onClick={() => toggleSort("device")} type="button">
                        Device {renderSortIcon("device")}
                      </button>
                    </th>
                    <th aria-sort={sort.key === "status" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className="sortHeader" onClick={() => toggleSort("status")} type="button">
                        Status {renderSortIcon("status")}
                      </button>
                    </th>
                    <th aria-sort={sort.key === "hash" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className="sortHeader" onClick={() => toggleSort("hash")} type="button">
                        Hash {renderSortIcon("hash")}
                      </button>
                    </th>
                    <th aria-sort={sort.key === "shares" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className="sortHeader" onClick={() => toggleSort("shares")} type="button">
                        Shares {renderSortIcon("shares")}
                      </button>
                    </th>
                    <th aria-sort={sort.key === "cpu" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className="sortHeader" onClick={() => toggleSort("cpu")} type="button">
                        CPU {renderSortIcon("cpu")}
                      </button>
                    </th>
                    <th aria-sort={sort.key === "temp" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className="sortHeader" onClick={() => toggleSort("temp")} type="button">
                        Temp {renderSortIcon("temp")}
                      </button>
                    </th>
                    <th aria-sort={sort.key === "config" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className="sortHeader" onClick={() => toggleSort("config")} type="button">
                        Config {renderSortIcon("config")}
                      </button>
                    </th>
                    <th aria-sort={sort.key === "created" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button className="sortHeader" onClick={() => toggleSort("created")} type="button">
                        Created {renderSortIcon("created")}
                      </button>
                    </th>
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
                            {device.statusLabel}
                          </span>
                        </td>
                        <td className="mono" title={device.hash ?? ""}>
                          {formatHashRate(device.hash)}
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
