"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, FileUp, History, Pencil, RefreshCw, Save, Search, Smartphone, Trash2, X } from "lucide-react";
import { LogoutButton } from "@/app/components/LogoutButton";
import {
  EARNAPP_COOKIE_STORAGE_KEY,
  getSavedEarnAppCookieTimeLeft,
  getValidSavedEarnAppCookie,
  saveEarnAppCookie,
} from "@/lib/earnapp-cookie";

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

type EarnAppUsagePoint = {
  date: string;
  usage: number;
  earned: number;
  raw: unknown;
};

type EarnAppDeviceUsage = {
  uuid: string;
  title: string;
  totalUsage: number;
  totalEarned: number;
  points: EarnAppUsagePoint[];
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
const EARNAPP_HOURLY_RATE_USD = 0.0069;
const EARNAPP_GOOD_USAGE_MS = 15 * 60 * 60 * 1000;

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

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatUsageDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  const totalSeconds = Math.floor(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function getUsageEarned(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return (value / 3_600_000) * EARNAPP_HOURLY_RATE_USD;
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

function getUsageMatchKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
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
  const [savedCookie, setSavedCookie] = useState("");
  const [savedCookieExpiresAt, setSavedCookieExpiresAt] = useState<number | null>(null);
  const [editingCookie, setEditingCookie] = useState(true);
  const [devices, setDevices] = useState<EarnAppDevice[]>([]);
  const [usageByDevice, setUsageByDevice] = useState<Record<string, EarnAppDeviceUsage>>({});
  const [verusDevices, setVerusDevices] = useState<VerusDevice[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [usageCheckedAt, setUsageCheckedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [earnAppTab, setEarnAppTab] = useState<EarnAppTab>("group");
  const [loading, setLoading] = useState(false);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [selectedDeviceUuids, setSelectedDeviceUuids] = useState<string[]>([]);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [usageModalDevice, setUsageModalDevice] = useState<EarnAppDevice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteSelection | null>(null);
  const [targetInvestmentId, setTargetInvestmentId] = useState<number | null>(null);
  const [incomeSaved, setIncomeSaved] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cookieFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeCookie = savedCookieExpiresAt ? savedCookie : "";

  function applySavedCookie(nextCookie: string, expiresAt: number) {
    setSavedCookie(nextCookie);
    setSavedCookieExpiresAt(expiresAt);
    setCookie(nextCookie);
    setEditingCookie(false);
  }

  function saveCookie() {
    const nextCookie = cookie.trim();

    if (!nextCookie) {
      setError("Paste or upload your EarnApp cookie first.");
      return;
    }

    const savedValue = saveEarnAppCookie(window.localStorage, nextCookie);

    applySavedCookie(savedValue.cookie, savedValue.expiresAt);
    setError(null);
  }

  function editCookie() {
    setEditingCookie(true);
    setCookie(activeCookie || savedCookie);
  }

  function requireActiveCookie() {
    if (activeCookie) {
      return activeCookie;
    }

    setSavedCookie("");
    setSavedCookieExpiresAt(null);
    setEditingCookie(true);
    window.localStorage.removeItem(EARNAPP_COOKIE_STORAGE_KEY);
    setError("Your saved EarnApp cookie expired. Paste or upload it again.");

    return "";
  }

  async function uploadCookieFile(file: File) {
    const text = await file.text();

    setCookie(text);
    setEditingCookie(true);
    setError(null);
  }

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

  useEffect(() => {
    const parsedCookie = getValidSavedEarnAppCookie(window.localStorage);

    if (parsedCookie) {
      window.setTimeout(() => applySavedCookie(parsedCookie.cookie, parsedCookie.expiresAt), 0);
    }
  }, []);

  useEffect(() => {
    if (!savedCookieExpiresAt) {
      return;
    }

    const timeout = window.setTimeout(
      () => {
        setSavedCookie("");
        setSavedCookieExpiresAt(null);
        setEditingCookie(true);
        window.localStorage.removeItem(EARNAPP_COOKIE_STORAGE_KEY);
      },
      Math.max(0, savedCookieExpiresAt - Date.now()),
    );

    return () => window.clearTimeout(timeout);
  }, [savedCookieExpiresAt]);

  async function loadEarnAppDevices() {
    const pastedCookie = requireActiveCookie();

    if (!pastedCookie) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [devicesResponse, usageResponse] = await Promise.all([
        fetch(getAppPath("/api/earnapp/devices"), {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cookie: pastedCookie }),
        }),
        fetch(getAppPath("/api/earnapp/usage"), {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cookie: pastedCookie }),
        }),
      ]);
      const result = (await devicesResponse.json()) as { checkedAt?: string; devices?: EarnAppDevice[]; error?: string };
      const usageResult = (await usageResponse.json()) as {
        checkedAt?: string;
        usageByDevice?: Record<string, EarnAppDeviceUsage>;
        error?: string;
      };

      if (!devicesResponse.ok) {
        throw new Error(result.error ?? "Failed to load EarnApp devices.");
      }

      setDevices(result.devices ?? []);
      setCheckedAt(result.checkedAt ?? new Date().toISOString());
      setUsageByDevice(usageResponse.ok ? (usageResult.usageByDevice ?? {}) : {});
      setUsageCheckedAt(usageResponse.ok ? (usageResult.checkedAt ?? new Date().toISOString()) : null);

      if (!usageResponse.ok) {
        setError(usageResult.error ? `Devices loaded, but usage history failed: ${usageResult.error}` : "Devices loaded, but usage history failed.");
      }
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

  function getDeviceSelectionKey(device: EarnAppDevice) {
    return device.uuid || `${device.title}-${device.country}-${device.ips[0] ?? ""}`;
  }

  function getDeviceUsage(device: EarnAppDevice) {
    const directUsage = usageByDevice[device.uuid];

    if (directUsage) {
      return directUsage;
    }

    const deviceTitleKey = getUsageMatchKey(device.title);

    return Object.values(usageByDevice).find((usage) => getUsageMatchKey(usage.uuid) === getUsageMatchKey(device.uuid) || getUsageMatchKey(usage.title) === deviceTitleKey) ?? null;
  }

  function toggleSelectedDevice(device: EarnAppDevice) {
    const uuid = device.uuid.trim();

    if (!uuid) {
      return;
    }

    setSelectedDeviceUuids((currentUuids) =>
      currentUuids.includes(uuid) ? currentUuids.filter((currentUuid) => currentUuid !== uuid) : [...currentUuids, uuid],
    );
  }

  function toggleSelectedGroup(group: EarnAppDeviceGroup) {
    setSelectedGroupKeys((currentKeys) =>
      currentKeys.includes(group.key) ? currentKeys.filter((currentKey) => currentKey !== group.key) : [...currentKeys, group.key],
    );
  }

  function openBatchDeviceDeleteModal() {
    const selectedDevices = devices.filter((device) => selectedDeviceUuids.includes(device.uuid));

    if (selectedDevices.length === 0) {
      setError("Choose at least one EarnApp device to delete.");
      return;
    }

    openDeleteModal({
      key: `batch-devices-${selectedDevices.map((device) => device.uuid).join("-")}`,
      title: `${selectedDevices.length} selected device${selectedDevices.length === 1 ? "" : "s"}`,
      devices: selectedDevices,
    });
  }

  function openBatchGroupDeleteModal(groups: EarnAppDeviceGroup[]) {
    const selectedGroups = groups.filter((group) => selectedGroupKeys.includes(group.key));
    const selectedDevices = selectedGroups.flatMap((group) => group.devices);

    if (selectedDevices.length === 0) {
      setError("Choose at least one EarnApp group to delete.");
      return;
    }

    openDeleteModal({
      key: `batch-groups-${selectedGroups.map((group) => group.key).join("-")}`,
      title: `${selectedGroups.length} selected group${selectedGroups.length === 1 ? "" : "s"}`,
      devices: selectedDevices,
    });
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
    const pastedCookie = requireActiveCookie();
    const earnedAmount = getSelectionEarned(selection);
    const devicesToDelete = selection.devices.filter((device) => device.uuid.trim());

    if (!pastedCookie) {
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
      setSelectedDeviceUuids((currentUuids) => currentUuids.filter((uuid) => !deletedUuids.has(uuid)));
      setSelectedGroupKeys([]);
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
  const selectableVisibleDevices = visibleTableDevices.filter((device) => device.uuid.trim());
  const selectedVisibleDeviceCount = selectableVisibleDevices.filter((device) => selectedDeviceUuids.includes(device.uuid)).length;
  const selectedGroupCount = filteredGroups.filter((group) => selectedGroupKeys.includes(group.key)).length;
  const selectedGroupDeviceCount = filteredGroups
    .filter((group) => selectedGroupKeys.includes(group.key))
    .reduce((total, group) => total + group.devices.filter((device) => device.uuid.trim()).length, 0);
  const activeCount = devices.filter(isEarnAppDeviceActive).length;
  const earned = devices.reduce((total, device) => total + device.earned, 0);
  const earnedTotal = devices.reduce((total, device) => total + device.earned_total, 0);
  const zeroEarnedCount = devices.filter((device) => device.earned <= 0).length;
  const usageDeviceCount = Object.values(usageByDevice).filter((usage) => usage.points.length > 0).length;
  const modalUsage = usageModalDevice ? getDeviceUsage(usageModalDevice) : null;
  const modalUsagePoints = modalUsage?.points.slice().sort((first, second) => second.date.localeCompare(first.date)) ?? [];

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
              <strong>{activeCookie && !editingCookie ? `Cookie saved, ${getSavedEarnAppCookieTimeLeft(savedCookieExpiresAt)}` : "Paste cookie or exported cookies JSON"}</strong>
            </div>
            <button className="loadConfig" type="button" onClick={() => void loadEarnAppDevices()} disabled={loading || !activeCookie}>
              <RefreshCw size={17} />
              {loading ? "Loading..." : "Load Devices + Usage"}
            </button>
          </div>

          <input
            ref={cookieFileInputRef}
            type="file"
            accept="application/json,.json,text/plain,.txt"
            className="hiddenInput"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void uploadCookieFile(file);
              }

              event.target.value = "";
            }}
          />

          {editingCookie || !activeCookie ? (
            <div className="earnAppCookieEditor">
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
              <div className="earnAppCookieActions">
                <button type="button" className="secondaryButton" onClick={() => cookieFileInputRef.current?.click()}>
                  <FileUp size={17} />
                  Upload cookies.json
                </button>
                <button type="button" className="loadConfig" onClick={saveCookie} disabled={!cookie.trim()}>
                  <Save size={17} />
                  Save for 1 day
                </button>
              </div>
            </div>
          ) : (
            <div className="earnAppCookieSaved">
              <span>{getSavedEarnAppCookieTimeLeft(savedCookieExpiresAt)}</span>
              <div>
                <button type="button" className="secondaryButton" onClick={editCookie}>
                  <Pencil size={17} />
                  Edit Cookie
                </button>
                <button type="button" className="secondaryButton" onClick={() => cookieFileInputRef.current?.click()}>
                  <FileUp size={17} />
                  Upload New JSON
                </button>
              </div>
            </div>
          )}

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
              <span>Usage History</span>
              <strong>{usageDeviceCount ? `${usageDeviceCount} devices` : "-"}</strong>
            </div>
            <div>
              <span>Last Check</span>
              <strong>{usageCheckedAt ? formatDate(usageCheckedAt) : checkedAt ? formatDate(checkedAt) : "-"}</strong>
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
            <>
            <div className="batchActions">
              <label className="selectionToggle">
                <input
                  type="checkbox"
                  checked={filteredGroups.length > 0 && selectedGroupCount === filteredGroups.length}
                  onChange={(event) => setSelectedGroupKeys(event.target.checked ? filteredGroups.map((group) => group.key) : [])}
                />
                <span>Select groups</span>
              </label>
              <div>
                <span>
                  {selectedGroupCount} group{selectedGroupCount === 1 ? "" : "s"}, {selectedGroupDeviceCount} device
                  {selectedGroupDeviceCount === 1 ? "" : "s"}
                </span>
                <button type="button" className="loadConfig dangerButton" onClick={() => openBatchGroupDeleteModal(filteredGroups)} disabled={selectedGroupCount === 0 || Boolean(deletingUuid)}>
                  <Trash2 size={17} />
                  Delete Selected
                </button>
              </div>
            </div>
            <div className="earnAppGroups">
              {filteredGroups.map((group) => (
                <article className="earnAppGroup" key={group.key}>
                  <div className="earnAppGroupHeader">
                    <label className="selectionToggle iconOnly" title={`Select ${group.label}`}>
                      <input type="checkbox" checked={selectedGroupKeys.includes(group.key)} onChange={() => toggleSelectedGroup(group)} />
                      <span>Select {group.label}</span>
                    </label>
                    <div>
                      <strong>{group.label}</strong>
                      <span>{group.devices.map((device) => device.title).join(", ")}</span>
                    </div>
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
            </>
          )}
        </section>
        ) : (

        <section className="earnAppSection" aria-label="All EarnApp devices">
          <div className="batchActions">
            <label className="selectionToggle">
              <input
                type="checkbox"
                checked={selectableVisibleDevices.length > 0 && selectedVisibleDeviceCount === selectableVisibleDevices.length}
                onChange={(event) => setSelectedDeviceUuids(event.target.checked ? selectableVisibleDevices.map((device) => device.uuid) : [])}
                disabled={selectableVisibleDevices.length === 0}
              />
              <span>Select visible</span>
            </label>
            <div>
              <span>
                {selectedDeviceUuids.length} device{selectedDeviceUuids.length === 1 ? "" : "s"} selected
              </span>
              <button type="button" className="loadConfig dangerButton" onClick={openBatchDeviceDeleteModal} disabled={selectedDeviceUuids.length === 0 || Boolean(deletingUuid)}>
                <Trash2 size={17} />
                Delete Selected
              </button>
            </div>
          </div>
          <div className="tableWrap earnAppTable">
            <table>
              <thead>
                <tr>
                  <th aria-label="Select devices">
                    <input
                      type="checkbox"
                      checked={selectableVisibleDevices.length > 0 && selectedVisibleDeviceCount === selectableVisibleDevices.length}
                      onChange={(event) => setSelectedDeviceUuids(event.target.checked ? selectableVisibleDevices.map((device) => device.uuid) : [])}
                      disabled={selectableVisibleDevices.length === 0}
                    />
                  </th>
                  <th aria-label="Usage history"></th>
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
                    <td className="empty" colSpan={12}>
                      Loading EarnApp devices...
                    </td>
                  </tr>
                ) : visibleTableDevices.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={12}>
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
                    const usage = getDeviceUsage(device);

                    return (
                      <tr key={device.uuid || `${device.title}-${index}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedDeviceUuids.includes(device.uuid)}
                            onChange={() => toggleSelectedDevice(device)}
                            disabled={!device.uuid.trim()}
                            aria-label={`Select ${device.title}`}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`iconButton usageIconButton ${usage?.points.length ? "hasUsage" : ""}`}
                            onClick={() => setUsageModalDevice(device)}
                            aria-label={`View usage history for ${device.title}`}
                            title={`View usage history${usage?.points.length ? ` (${formatUsageDuration(usage.totalUsage)})` : ""}`}
                          >
                            <History size={16} />
                          </button>
                        </td>
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

      {usageModalDevice ? (
        <div className="toolModal" role="dialog" aria-modal="true" aria-label="EarnApp usage history">
          <button className="toolModalBackdrop" type="button" aria-label="Close usage history" onClick={() => setUsageModalDevice(null)} />
          <div className="toolDialog earnAppUsageDialog">
            <div className="toolModalBar">
              <div>
                <span>Usage History</span>
                <strong>{usageModalDevice.title || usageModalDevice.uuid}</strong>
              </div>
              <button type="button" aria-label="Close usage history" onClick={() => setUsageModalDevice(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="earnAppUsageBody">
              <div className="earnAppMetrics">
                <div>
                  <span>Total Usage</span>
                  <strong>{modalUsage ? formatUsageDuration(modalUsage.totalUsage) : "-"}</strong>
                </div>
                <div>
                  <span>Total Earned</span>
                  <strong>{modalUsage ? formatUsd(getUsageEarned(modalUsage.totalUsage)) : "-"}</strong>
                </div>
                <div>
                  <span>Daily Records</span>
                  <strong>{modalUsagePoints.length}</strong>
                </div>
                <div>
                  <span>Last Usage</span>
                  <strong>{modalUsagePoints[0] ? formatShortDate(modalUsagePoints[0].date) : "-"}</strong>
                </div>
              </div>

              {modalUsagePoints.length === 0 ? (
                <div className="imageMergeEmpty">No usage records found for this device.</div>
              ) : (
                <div className="usageDailyGrid">
                  {modalUsagePoints.map((point) => {
                    const isGoodUsage = point.usage >= EARNAPP_GOOD_USAGE_MS;

                    return (
                      <article className={`usageDailyCard ${isGoodUsage ? "good" : "low"}`} key={`${usageModalDevice.uuid}-${point.date}`}>
                        <div>
                          <span>{formatShortDate(point.date)}</span>
                          <strong>{formatUsageDuration(point.usage)}</strong>
                        </div>
                        <dl>
                          <div>
                            <dt>Earned</dt>
                            <dd>{formatUsd(getUsageEarned(point.usage))}</dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{isGoodUsage ? "15h+" : "Below 15h"}</dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
