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

type VerusDevice = {
  name: string | null;
  status: boolean | null;
};

type EarnAppDeviceGroup = {
  key: string;
  label: string;
  devices: EarnAppDevice[];
  earned: number;
};

type PendingDeleteSelection = {
  key: string;
  title: string;
  devices: EarnAppDevice[];
};

type EarnAppTab = "group" | "devices" | "recommended";

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

function getDeviceNameKey(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getDeviceGroupLabel(device: EarnAppDevice) {
  const key = getDeviceIncomeKey(device.title);

  return key ? `${key}*` : device.title || "Unnamed group";
}

function getSelectionEarned(selection: PendingDeleteSelection | null) {
  return selection?.devices.reduce((total, device) => total + device.earned, 0) ?? 0;
}

export default function EarnAppDevicesPage() {
  const [cookie, setCookie] = useState("");
  const [devices, setDevices] = useState<EarnAppDevice[]>([]);
  const [verusDevices, setVerusDevices] = useState<VerusDevice[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [earnAppTab, setEarnAppTab] = useState<EarnAppTab>("group");
  const [loading, setLoading] = useState(false);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteSelection | null>(null);
  const [targetInvestmentId, setTargetInvestmentId] = useState<number | null>(null);
  const [incomeSaved, setIncomeSaved] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPageData() {
      try {
        const [investmentsResponse, devicesResponse] = await Promise.all([
          fetch(getAppPath("/api/investments"), { cache: "no-store" }),
          fetch(getAppPath("/api/devices"), { cache: "no-store" }),
        ]);
        const investmentsResult = (await investmentsResponse.json()) as { investments?: Investment[]; error?: string };
        const devicesResult = (await devicesResponse.json()) as { devices?: VerusDevice[]; error?: string };

        if (!investmentsResponse.ok) {
          throw new Error(investmentsResult.error ?? "Failed to load expenditures.");
        }

        if (!devicesResponse.ok) {
          throw new Error(devicesResult.error ?? "Failed to load Verus devices.");
        }

        setInvestments(investmentsResult.investments ?? []);
        setVerusDevices(devicesResult.devices ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load page data.");
      }
    }

    void loadPageData();
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

  function openDeleteModal(selection: PendingDeleteSelection) {
    const earnedAmount = getSelectionEarned(selection);
    const matchingInvestment = investments.find((investment) => getDeviceIncomeKey(getInvestmentName(investment)) === selection.key);

    setPendingDelete(selection);
    setTargetInvestmentId(matchingInvestment?.id ?? null);
    setIncomeSaved(earnedAmount <= 0);
    setError(null);
  }

  async function saveDeviceIncome() {
    if (!pendingDelete) {
      return;
    }

    const earnedAmount = getSelectionEarned(pendingDelete);

    if (earnedAmount <= 0) {
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
          amount: earnedAmount,
          description: `EarnApp income from ${pendingDelete.title} (${pendingDelete.devices.map((device) => device.title).join(", ")})`,
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

  async function deleteEarnAppSelection(selection: PendingDeleteSelection) {
    const pastedCookie = cookie.trim();
    const earnedAmount = getSelectionEarned(selection);
    const devicesToDelete = selection.devices.filter((device) => device.uuid.trim());

    if (!pastedCookie) {
      setError("Paste your EarnApp cookie header or cookies.json export first.");
      return;
    }

    if (devicesToDelete.length === 0) {
      setError("This EarnApp selection has no UUIDs to delete.");
      return;
    }

    if (earnedAmount > 0 && !incomeSaved) {
      setError("Save the earned amount to an expenditure before deleting this selection.");
      return;
    }

    setDeletingUuid(selection.key);
    setError(null);

    try {
      for (const device of devicesToDelete) {
        const response = await fetch(getAppPath(`/api/earnapp/device/${encodeURIComponent(device.uuid)}`), {
          method: "DELETE",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cookie: pastedCookie }),
        });
        const result = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? `Failed to delete ${device.title || device.uuid}.`);
        }
      }

      const deletedUuids = new Set(devicesToDelete.map((device) => device.uuid));

      setDevices((currentDevices) => currentDevices.filter((currentDevice) => !deletedUuids.has(currentDevice.uuid)));
      setPendingDelete(null);
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

  const filteredGroups = useMemo<EarnAppDeviceGroup[]>(() => {
    const groups = new Map<string, EarnAppDevice[]>();

    filteredDevices.forEach((device) => {
      const key = getDeviceIncomeKey(device.title) || device.title || device.uuid;
      const matchingDevices = groups.get(key) ?? [];

      matchingDevices.push(device);
      groups.set(key, matchingDevices);
    });

    return [...groups.entries()].map(([key, groupDevices]) => ({
      key,
      label: getDeviceGroupLabel(groupDevices[0]),
      devices: groupDevices,
      earned: groupDevices.reduce((total, device) => total + device.earned, 0),
    }));
  }, [filteredDevices]);

  const offlineVerusDeviceNames = useMemo(
    () => new Set(verusDevices.filter((device) => !device.status).map((device) => getDeviceNameKey(device.name)).filter(Boolean)),
    [verusDevices],
  );
  const recommendedDevices = useMemo(
    () => filteredDevices.filter((device) => offlineVerusDeviceNames.has(getDeviceNameKey(device.title))),
    [filteredDevices, offlineVerusDeviceNames],
  );
  const visibleTableDevices = earnAppTab === "recommended" ? recommendedDevices : filteredDevices;
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

        <div className="tabs" role="tablist" aria-label="EarnApp device views">
          <button
            className={`tab ${earnAppTab === "group" ? "active" : ""}`}
            onClick={() => setEarnAppTab("group")}
            role="tab"
            aria-selected={earnAppTab === "group"}
          >
            <Smartphone size={16} aria-hidden="true" />
            <span>Group {filteredGroups.length}</span>
          </button>
          <button
            className={`tab ${earnAppTab === "devices" ? "active" : ""}`}
            onClick={() => setEarnAppTab("devices")}
            role="tab"
            aria-selected={earnAppTab === "devices"}
          >
            <Smartphone size={16} aria-hidden="true" />
            <span>All Devices {filteredDevices.length}</span>
          </button>
          <button
            className={`tab ${earnAppTab === "recommended" ? "active" : ""}`}
            onClick={() => setEarnAppTab("recommended")}
            role="tab"
            aria-selected={earnAppTab === "recommended"}
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>Recommended {recommendedDevices.length}</span>
          </button>
        </div>

        {earnAppTab === "group" ? (
        <section className="earnAppSection" aria-label="EarnApp device groups">
          {filteredGroups.length === 0 ? (
            <div className="imageMergeEmpty">No groups loaded.</div>
          ) : (
            <div className="earnAppGroups">
              {filteredGroups.map((group) => (
                <article className="earnAppGroup" key={group.key}>
                  <div>
                    <strong>{group.label}</strong>
                    <span>{group.devices.map((device) => device.title).join(", ")}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Devices</dt>
                      <dd>{group.devices.length}</dd>
                    </div>
                    <div>
                      <dt>Earned</dt>
                      <dd>{formatUsd(group.earned)}</dd>
                    </div>
                    <div>
                      <dt>Zero Earned</dt>
                      <dd>{group.devices.filter((device) => device.earned <= 0).length}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="loadConfig dangerButton"
                    onClick={() =>
                      openDeleteModal({
                        key: group.key,
                        title: group.label,
                        devices: group.devices,
                      })
                    }
                    disabled={deletingUuid === group.key || group.devices.every((device) => !device.uuid)}
                  >
                    <Trash2 size={17} />
                    Group Delete
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
        ) : (

        <section className="earnAppSection" aria-label="All EarnApp devices">
          <div className="tableWrap earnAppTable">
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
                ) : visibleTableDevices.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={10}>
                      {devices.length > 0
                        ? earnAppTab === "recommended"
                          ? "No EarnApp devices match offline Verus devices."
                          : "No EarnApp devices match your search."
                        : "Paste a cookie and load devices."}
                    </td>
                  </tr>
                ) : (
                  visibleTableDevices.map((device, index) => {
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
                            onClick={() =>
                              openDeleteModal({
                                key: getDeviceIncomeKey(device.title) || device.title || device.uuid,
                                title: device.title || device.uuid,
                                devices: [device],
                              })
                            }
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
          </div>
        </section>
        )}
      </div>

      {pendingDelete ? (
        <div className="toolModal" role="dialog" aria-modal="true" aria-label="Confirm EarnApp delete">
          <button className="toolModalBackdrop" type="button" aria-label="Close delete confirmation" onClick={() => setPendingDelete(null)} />
          <div className="toolDialog earnAppDeleteDialog">
            <div className="toolModalBar">
              <div>
                <span>{pendingDelete.devices.length === 1 ? "Delete EarnApp Device" : "Delete EarnApp Group"}</span>
                <strong>{pendingDelete.title}</strong>
              </div>
              <button type="button" aria-label="Close delete confirmation" onClick={() => setPendingDelete(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="earnAppDeleteBody">
              <div className="earnAppMetrics">
                <div>
                  <span>Earned</span>
                  <strong>{formatUsd(getSelectionEarned(pendingDelete))}</strong>
                </div>
                <div>
                  <span>Devices</span>
                  <strong>{pendingDelete.devices.length}</strong>
                </div>
              </div>

              <div className="earnAppDeleteDeviceList">
                {pendingDelete.devices.map((device) => (
                  <span key={device.uuid || device.title}>{device.title || device.uuid}</span>
                ))}
              </div>

              {getSelectionEarned(pendingDelete) > 0 ? (
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
                <div className="notice">This selection earned {formatUsd(0)}, so delete is unlocked without saving income.</div>
              )}

              {getSelectionEarned(pendingDelete) > 0 ? (
                <button type="button" className="loadConfig" onClick={() => void saveDeviceIncome()} disabled={savingIncome || incomeSaved || !targetInvestmentId}>
                  {incomeSaved ? <Check size={17} /> : <Save size={17} />}
                  {incomeSaved ? "Saved" : savingIncome ? "Saving..." : "Save Income"}
                </button>
              ) : null}

              <div className="notice">Deleting is separate from saving. Devices will stay in EarnApp until you press Delete.</div>
            </div>

            <div className="toolModalFooter">
              <button type="button" className="secondaryButton" onClick={() => setPendingDelete(null)} disabled={deletingUuid === pendingDelete.key}>
                Cancel
              </button>
              <button
                type="button"
                className="loadConfig dangerButton"
                onClick={() => void deleteEarnAppSelection(pendingDelete)}
                disabled={deletingUuid === pendingDelete.key || (getSelectionEarned(pendingDelete) > 0 && !incomeSaved)}
              >
                <Trash2 size={17} />
                {deletingUuid === pendingDelete.key ? "Deleting..." : pendingDelete.devices.length === 1 ? "Delete Device" : "Delete Group"}
              </button>
            </div>
          </div>
        </div>
      ) : null}    </main>
  );
}
