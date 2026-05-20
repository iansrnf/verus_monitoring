"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, RefreshCw, Save, Search, Smartphone, Trash2, X } from "lucide-react";
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

type Investment = {
  id: number;
  name: string | null;
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

function getInvestmentName(investment: Investment) {
  return investment.name?.trim() || "Untitled investment";
}

function getDeviceIncomeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\d+$/g, "");
}

export default function EarnAppDevicesPage() {
  const [cookie, setCookie] = useState("");
  const [devices, setDevices] = useState<EarnAppDevice[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [pendingDeleteDevice, setPendingDeleteDevice] = useState<EarnAppDevice | null>(null);
  const [targetInvestmentId, setTargetInvestmentId] = useState<number | null>(null);
  const [incomeSaved, setIncomeSaved] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInvestments() {
      try {
        const response = await fetch(getAppPath("/api/investments"), { cache: "no-store" });
        const result = (await response.json()) as { investments?: Investment[]; error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Failed to load expenditures.");
        }

        setInvestments(result.investments ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load expenditures.");
      }
    }

    void loadInvestments();
  }, []);

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

  function openDeleteModal(device: EarnAppDevice) {
    const key = getDeviceIncomeKey(device.title);
    const matchingInvestment = investments.find((investment) => getDeviceIncomeKey(getInvestmentName(investment)) === key);

    setPendingDeleteDevice(device);
    setTargetInvestmentId(matchingInvestment?.id ?? null);
    setIncomeSaved(device.earned <= 0);
    setError(null);
  }

  async function saveDeviceIncome() {
    if (!pendingDeleteDevice) {
      return;
    }

    if (pendingDeleteDevice.earned <= 0) {
      setIncomeSaved(true);
      return;
    }

    if (!targetInvestmentId) {
      setError("Choose the target expenditure before saving income.");
      return;
    }

    setSavingIncome(true);
    setError(null);

    try {
      const response = await fetch(getAppPath(`/api/investments/${targetInvestmentId}/income`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: pendingDeleteDevice.earned,
          description: `EarnApp income from ${pendingDeleteDevice.title}`,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save EarnApp income.");
      }

      setIncomeSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save EarnApp income.");
    } finally {
      setSavingIncome(false);
    }
  }

  async function deleteEarnAppDevice(device: EarnAppDevice) {
    const pastedCookie = cookie.trim();
    const uuid = device.uuid.trim();

    if (!pastedCookie) {
      setError("Paste your EarnApp cookie header or cookies.json export first.");
      return;
    }

    if (!uuid) {
      setError("This EarnApp device has no UUID to delete.");
      return;
    }

    if (device.earned > 0 && !incomeSaved) {
      setError("Save the earned amount to an expenditure before deleting this device.");
      return;
    }

    setDeletingUuid(uuid);
    setError(null);

    try {
      const response = await fetch(getAppPath(`/api/earnapp/device/${encodeURIComponent(uuid)}`), {
        method: "DELETE",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: pastedCookie }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to delete EarnApp device.");
      }

      setDevices((currentDevices) => currentDevices.filter((currentDevice) => currentDevice.uuid !== uuid));
      setPendingDeleteDevice(null);
      setIncomeSaved(false);
      setTargetInvestmentId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete EarnApp device.");
    } finally {
      setDeletingUuid(null);
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
    <main className="page earnAppPage">
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && devices.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={10}>
                    Loading EarnApp devices...
                  </td>
                </tr>
              ) : filteredDevices.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={10}>
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
                      <td>
                        <button
                          type="button"
                          className="dangerIcon"
                          onClick={() => openDeleteModal(device)}
                          disabled={deletingUuid === device.uuid || !device.uuid}
                          aria-label={`Delete ${device.title}`}
                          title="Delete EarnApp device"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      </div>

      {pendingDeleteDevice ? (
        <div className="toolModal" role="dialog" aria-modal="true" aria-label="Confirm EarnApp device delete">
          <button className="toolModalBackdrop" type="button" aria-label="Close delete confirmation" onClick={() => setPendingDeleteDevice(null)} />
          <div className="toolDialog earnAppDeleteDialog">
            <div className="toolModalBar">
              <div>
                <span>Delete EarnApp Device</span>
                <strong>{pendingDeleteDevice.title || pendingDeleteDevice.uuid}</strong>
              </div>
              <button type="button" aria-label="Close delete confirmation" onClick={() => setPendingDeleteDevice(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="earnAppDeleteBody">
              <div className="earnAppMetrics">
                <div>
                  <span>Earned</span>
                  <strong>{formatUsd(pendingDeleteDevice.earned)}</strong>
                </div>
                <div>
                  <span>UUID</span>
                  <strong>{pendingDeleteDevice.uuid}</strong>
                </div>
              </div>

              {pendingDeleteDevice.earned > 0 ? (
                <label className="earnAppTargetField">
                  <span>Target Expenditure</span>
                  <select
                    value={targetInvestmentId ?? ""}
                    onChange={(event) => {
                      setTargetInvestmentId(event.target.value ? Number(event.target.value) : null);
                      setIncomeSaved(false);
                    }}
                    disabled={savingIncome || incomeSaved}
                  >
                    <option value="">No match</option>
                    {investments.map((investment) => (
                      <option key={investment.id} value={investment.id}>
                        {getInvestmentName(investment)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="notice">This device earned {formatUsd(0)}, so delete is unlocked without saving income.</div>
              )}

              {pendingDeleteDevice.earned > 0 ? (
                <button
                  type="button"
                  className="loadConfig"
                  onClick={() => void saveDeviceIncome()}
                  disabled={savingIncome || incomeSaved || !targetInvestmentId}
                >
                  {incomeSaved ? <Check size={17} /> : <Save size={17} />}
                  {incomeSaved ? "Saved" : savingIncome ? "Saving..." : "Save Income"}
                </button>
              ) : null}

              <div className="notice">Deleting is separate from saving. The device will stay in EarnApp until you press Delete Device.</div>
            </div>

            <div className="toolModalFooter">
              <button type="button" className="secondaryButton" onClick={() => setPendingDeleteDevice(null)} disabled={deletingUuid === pendingDeleteDevice.uuid}>
                Cancel
              </button>
              <button
                type="button"
                className="loadConfig dangerButton"
                onClick={() => void deleteEarnAppDevice(pendingDeleteDevice)}
                disabled={deletingUuid === pendingDeleteDevice.uuid || (pendingDeleteDevice.earned > 0 && !incomeSaved)}
              >
                <Trash2 size={17} />
                {deletingUuid === pendingDeleteDevice.uuid ? "Deleting..." : "Delete Device"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
