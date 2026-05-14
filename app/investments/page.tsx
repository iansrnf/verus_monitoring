"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  BarChart3,
  Check,
  Download,
  FileUp,
  FolderOpen,
  Images,
  LineChart,
  MoveDown,
  MoveUp,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { LogoutButton } from "@/app/components/LogoutButton";

type Income = {
  id: number;
  inv_id: number;
  amount: number;
  description: string | null;
  created_at: string | null;
};

type Investment = {
  id: number;
  name: string | null;
  cost: number;
  description: string | null;
  created_at: string | null;
  total_income: number;
  income_count: number;
  incomes: Income[];
};

type ImportMode = "native" | "legacy";
type InvestmentMobileView = "detail" | "list" | "add";
type InvestmentListTab = "expenditures" | "roi";
type InvestmentSortKey = "name" | "cost" | "created_at";
type SortDirection = "asc" | "desc";
type InvestmentChartMode = "line" | "bar";

type ImageMergeItem = {
  id: string;
  name: string;
  size: number;
  url: string;
};

type ChartPoint = {
  id: string;
  kind: "income" | "expenditure";
  label: string;
  amount: number;
  timestamp: number;
};

const APP_BASE_PATH = "/verus-monitoring";
const USD_TO_PHP = 61.458;

function getAppPath(path: string) {
  return `${APP_BASE_PATH}${path}`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPhp(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value * USD_TO_PHP);
}

function formatMoney(value: number) {
  return `${formatUsd(value)} / ${formatPhp(value)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

function getInvestmentName(investment: Investment) {
  return investment.name?.trim() || "Untitled investment";
}

function getProfit(investment: Investment) {
  return investment.total_income - investment.cost;
}

function getExportFileName() {
  return `verus-investments-${new Date().toISOString().slice(0, 10)}.json`;
}

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [selectedInvestmentId, setSelectedInvestmentId] = useState<number | null>(null);
  const [investmentName, setInvestmentName] = useState("");
  const [investmentCost, setInvestmentCost] = useState("");
  const [investmentDescription, setInvestmentDescription] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDescription, setIncomeDescription] = useState("");
  const [editInvestmentName, setEditInvestmentName] = useState("");
  const [editInvestmentCost, setEditInvestmentCost] = useState("");
  const [editInvestmentDescription, setEditInvestmentDescription] = useState("");
  const [editIncomeAmount, setEditIncomeAmount] = useState("");
  const [editIncomeDescription, setEditIncomeDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingInvestment, setSavingInvestment] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [savingInvestmentEdit, setSavingInvestmentEdit] = useState(false);
  const [savingIncomeEditId, setSavingIncomeEditId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("native");
  const [showInvestmentForm, setShowInvestmentForm] = useState(false);
  const [mobileView, setMobileView] = useState<InvestmentMobileView>("detail");
  const [investmentListTab, setInvestmentListTab] = useState<InvestmentListTab>("expenditures");
  const [investmentQuery, setInvestmentQuery] = useState("");
  const [investmentSortKey, setInvestmentSortKey] = useState<InvestmentSortKey>("created_at");
  const [investmentSortDirection, setInvestmentSortDirection] = useState<SortDirection>("desc");
  const [chartMode, setChartMode] = useState<InvestmentChartMode>("line");
  const [showChart, setShowChart] = useState(false);
  const [editingInvestmentId, setEditingInvestmentId] = useState<number | null>(null);
  const [editingIncomeId, setEditingIncomeId] = useState<number | null>(null);
  const [imageMergerOpen, setImageMergerOpen] = useState(false);
  const [imageMergeItems, setImageMergeItems] = useState<ImageMergeItem[]>([]);
  const [imageMergeError, setImageMergeError] = useState<string | null>(null);
  const [mergingImages, setMergingImages] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const imageMergeInputRef = useRef<HTMLInputElement | null>(null);
  const imageMergeItemsRef = useRef<ImageMergeItem[]>([]);
  const importModeRef = useRef<ImportMode>("native");

  const loadInvestments = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    const response = await fetch(getAppPath("/api/investments"), { cache: "no-store" });
    const result = (await response.json()) as { investments?: Investment[]; error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to load investments.");
    } else {
      const nextInvestments = result.investments ?? [];

      setError(null);
      setInvestments(nextInvestments);
      setSelectedInvestmentId((currentId) => currentId ?? nextInvestments[0]?.id ?? null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // The database is the external source of truth for this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInvestments();
  }, [loadInvestments]);

  useEffect(() => {
    imageMergeItemsRef.current = imageMergeItems;
  }, [imageMergeItems]);

  useEffect(() => {
    return () => {
      imageMergeItemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  const selectedInvestment = useMemo(
    () => investments.find((investment) => investment.id === selectedInvestmentId) ?? investments[0] ?? null,
    [investments, selectedInvestmentId],
  );

  const totals = useMemo(() => {
    const cost = investments.reduce((total, investment) => total + investment.cost, 0);
    const income = investments.reduce((total, investment) => total + investment.total_income, 0);

    return {
      cost,
      income,
      profit: income - cost,
    };
  }, [investments]);

  const investmentGroups = useMemo(() => {
    const expenditures = investments.filter((investment) => investment.total_income <= 0 || getProfit(investment) < 0);
    const roi = investments.filter((investment) => investment.total_income > 0 && getProfit(investment) >= 0);

    return { expenditures, roi };
  }, [investments]);

  const visibleInvestments = useMemo(() => {
    const query = investmentQuery.trim().toLowerCase();
    const searchedInvestments = query
      ? investmentGroups[investmentListTab].filter((investment) =>
          [
            getInvestmentName(investment),
            investment.description,
            investment.cost,
            investment.total_income,
            getProfit(investment),
            investment.created_at ? formatDate(investment.created_at) : null,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)),
        )
      : investmentGroups[investmentListTab];

    return [...searchedInvestments].sort((firstInvestment, secondInvestment) => {
      let comparison = 0;

      if (investmentSortKey === "name") {
        comparison = getInvestmentName(firstInvestment).localeCompare(getInvestmentName(secondInvestment), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      } else if (investmentSortKey === "cost") {
        comparison = firstInvestment.cost - secondInvestment.cost;
      } else {
        comparison = new Date(firstInvestment.created_at ?? 0).getTime() - new Date(secondInvestment.created_at ?? 0).getTime();
      }

      return investmentSortDirection === "asc" ? comparison : -comparison;
    });
  }, [investmentGroups, investmentListTab, investmentQuery, investmentSortDirection, investmentSortKey]);

  const chart = useMemo(() => {
    const points: ChartPoint[] = investments.flatMap((investment) => {
      const investmentDate = new Date(investment.created_at ?? "").getTime();
      const expenditurePoints: ChartPoint[] =
        Number.isFinite(investmentDate) && investment.cost > 0
          ? [
              {
                id: `investment-${investment.id}`,
                kind: "expenditure",
                label: getInvestmentName(investment),
                amount: investment.cost,
                timestamp: investmentDate,
              },
            ]
          : [];
      const incomePoints = investment.incomes.flatMap((income) => {
        const incomeDate = new Date(income.created_at ?? "").getTime();

        if (!Number.isFinite(incomeDate) || income.amount <= 0) {
          return [];
        }

        return [
          {
            id: `income-${income.id}`,
            kind: "income" as const,
            label: `${getInvestmentName(investment)}: ${income.description || "Income"}`,
            amount: income.amount,
            timestamp: incomeDate,
          },
        ];
      });

      return [...expenditurePoints, ...incomePoints];
    });

    const sortedPoints = [...points].sort((firstPoint, secondPoint) => firstPoint.timestamp - secondPoint.timestamp);
    const minTime = Math.min(...sortedPoints.map((point) => point.timestamp));
    const maxTime = Math.max(...sortedPoints.map((point) => point.timestamp));
    const maxAmount = Math.max(...sortedPoints.map((point) => point.amount), 1);
    const padding = { top: 22, right: 26, bottom: 32, left: 86 };
    const width = 720;
    const height = 320;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const timeSpan = Math.max(maxTime - minTime, 1);
    const getX = (timestamp: number) => padding.left + ((timestamp - minTime) / timeSpan) * plotWidth;
    const getY = (amount: number) => padding.top + plotHeight - (amount / maxAmount) * plotHeight;
    const incomePoints = sortedPoints.filter((point) => point.kind === "income");
    const expenditurePoints = sortedPoints.filter((point) => point.kind === "expenditure");
    const lineFor = (linePoints: ChartPoint[]) => linePoints.map((point) => `${getX(point.timestamp)},${getY(point.amount)}`).join(" ");
    const timeTicks = [0, 0.5, 1].map((position) => minTime + timeSpan * position);
    const amountTicks = [0, 0.5, 1].map((position) => maxAmount * position);

    return {
      amountTicks,
      expenditureLine: lineFor(expenditurePoints),
      expenditurePoints,
      getX,
      getY,
      height,
      incomeLine: lineFor(incomePoints),
      incomePoints,
      padding,
      points: sortedPoints,
      plotHeight,
      timeTicks,
      width,
    };
  }, [investments]);

  function toggleInvestmentSort(key: InvestmentSortKey) {
    if (investmentSortKey === key) {
      setInvestmentSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
      return;
    }

    setInvestmentSortKey(key);
    setInvestmentSortDirection(key === "name" ? "asc" : "desc");
  }

  async function createInvestment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingInvestment(true);
    setError(null);

    const response = await fetch(getAppPath("/api/investments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: investmentName,
        cost: investmentCost,
        description: investmentDescription,
      }),
    });
    const result = (await response.json()) as { investment?: Investment; error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to create investment.");
    } else {
      setInvestmentName("");
      setInvestmentCost("");
      setInvestmentDescription("");
      await loadInvestments(false);
      setSelectedInvestmentId(result.investment?.id ?? null);
      setShowInvestmentForm(false);
      setMobileView("detail");
    }

    setSavingInvestment(false);
  }

  async function createIncome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInvestment) {
      return;
    }

    setSavingIncome(true);
    setError(null);

    const response = await fetch(getAppPath(`/api/investments/${selectedInvestment.id}/income`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: incomeAmount,
        description: incomeDescription,
      }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to add income.");
    } else {
      setIncomeAmount("");
      setIncomeDescription("");
      await loadInvestments(false);
    }

    setSavingIncome(false);
  }

  async function deleteInvestment(investmentId: number) {
    const response = await fetch(getAppPath(`/api/investments/${investmentId}`), { method: "DELETE" });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to delete investment.");
      return;
    }

    setSelectedInvestmentId(null);
    setMobileView("list");
    await loadInvestments(false);
  }

  async function deleteIncome(incomeId: number) {
    const response = await fetch(getAppPath(`/api/income/${incomeId}`), { method: "DELETE" });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to delete income.");
      return;
    }

    await loadInvestments(false);
  }

  function beginEditInvestment(investment: Investment) {
    setEditingInvestmentId(investment.id);
    setEditInvestmentName(investment.name ?? "");
    setEditInvestmentCost(String(investment.cost ?? ""));
    setEditInvestmentDescription(investment.description ?? "");
    setError(null);
  }

  function cancelEditInvestment() {
    setEditingInvestmentId(null);
    setEditInvestmentName("");
    setEditInvestmentCost("");
    setEditInvestmentDescription("");
  }

  async function updateInvestment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedInvestment || editingInvestmentId !== selectedInvestment.id) {
      return;
    }

    setSavingInvestmentEdit(true);
    setError(null);

    const response = await fetch(getAppPath(`/api/investments/${selectedInvestment.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editInvestmentName,
        cost: editInvestmentCost,
        description: editInvestmentDescription,
      }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to update investment.");
    } else {
      cancelEditInvestment();
      await loadInvestments(false);
    }

    setSavingInvestmentEdit(false);
  }

  function beginEditIncome(income: Income) {
    setEditingIncomeId(income.id);
    setEditIncomeAmount(String(income.amount ?? ""));
    setEditIncomeDescription(income.description ?? "");
    setError(null);
  }

  function cancelEditIncome() {
    setEditingIncomeId(null);
    setEditIncomeAmount("");
    setEditIncomeDescription("");
  }

  async function updateIncome(event: React.FormEvent<HTMLFormElement>, incomeId: number) {
    event.preventDefault();

    setSavingIncomeEditId(incomeId);
    setError(null);

    const response = await fetch(getAppPath(`/api/income/${incomeId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: editIncomeAmount,
        description: editIncomeDescription,
      }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to update income.");
    } else {
      cancelEditIncome();
      await loadInvestments(false);
    }

    setSavingIncomeEditId(null);
  }

  function startImport(mode: ImportMode) {
    importModeRef.current = mode;
    setImportMode(mode);
    importInputRef.current?.click();
  }

  async function importInvestments(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const data = JSON.parse(await file.text()) as unknown;
      const response = await fetch(getAppPath("/api/investments/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: importModeRef.current, data }),
      });
      const result = (await response.json()) as {
        imported?: { investments: number; incomes: number };
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "Failed to import investments.");
        return;
      }

      await loadInvestments(false);
      setError(`Imported ${result.imported?.investments ?? 0} investments and ${result.imported?.incomes ?? 0} income records.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Failed to read import file.");
    } finally {
      setImporting(false);
    }
  }

  function exportInvestments() {
    const exportData = {
      app: "Verus Monitoring",
      version: 1,
      exportedAt: new Date().toISOString(),
      investments: investments.map((investment) => ({
        name: investment.name ?? "",
        cost: investment.cost,
        description: investment.description ?? "",
        created_at: investment.created_at,
        incomes: investment.incomes.map((income) => ({
          amount: income.amount,
          description: income.description ?? "",
          created_at: income.created_at,
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = getExportFileName();
    link.click();
    URL.revokeObjectURL(url);
  }

  function addImageMergeFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      setImageMergeError("Drop or select PNG/JPG/WebP screenshot files.");
      return;
    }

    setImageMergeError(null);
    setImageMergeItems((currentItems) => [
      ...currentItems,
      ...imageFiles.map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
      })),
    ]);
  }

  function removeImageMergeItem(itemId: string) {
    setImageMergeItems((currentItems) => {
      const item = currentItems.find((candidate) => candidate.id === itemId);

      if (item) {
        URL.revokeObjectURL(item.url);
      }

      return currentItems.filter((candidate) => candidate.id !== itemId);
    });
  }

  function clearImageMergeItems() {
    imageMergeItemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    setImageMergeItems([]);
    setImageMergeError(null);
  }

  function moveImageMergeItem(itemId: string, direction: -1 | 1) {
    setImageMergeItems((currentItems) => {
      const index = currentItems.findIndex((item) => item.id === itemId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= currentItems.length) {
        return currentItems;
      }

      const nextItems = [...currentItems];
      [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
      return nextItems;
    });
  }

  function loadMergeImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load one of the screenshots."));
      image.src = url;
    });
  }

  async function exportMergedImage() {
    if (imageMergeItems.length === 0) {
      setImageMergeError("Add at least one screenshot first.");
      return;
    }

    setMergingImages(true);
    setImageMergeError(null);

    try {
      const images = await Promise.all(imageMergeItems.map((item) => loadMergeImage(item.url)));
      const outputWidth = Math.max(...images.map((image) => image.naturalWidth));
      const heights = images.map((image) => Math.round((image.naturalHeight * outputWidth) / image.naturalWidth));
      const outputHeight = heights.reduce((total, height) => total + height, 0);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas is not available in this browser.");
      }

      canvas.width = outputWidth;
      canvas.height = outputHeight;

      let offsetY = 0;
      images.forEach((image, index) => {
        context.drawImage(image, 0, offsetY, outputWidth, heights[index]);
        offsetY += heights[index];
      });

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

      if (!blob) {
        throw new Error("Failed to create the merged PNG.");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `merged-screenshots-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (mergeError) {
      setImageMergeError(mergeError instanceof Error ? mergeError.message : "Failed to merge screenshots.");
    } finally {
      setMergingImages(false);
    }
  }

  return (
    <>
    <main className="page investmentPage">
      <div className="shell">
        <header className="topbar">
          <div className="titleBlock">
            <Link className="backLink" href="/">
              <ArrowLeft size={16} />
              Devices
            </Link>
            <h1>Investment Dashboard</h1>
            <p>Track expenditures like phones and services, then record income against each investment.</p>
            <LogoutButton />
          </div>

          <div className="summary" aria-label="Investment summary">
            <div className="metric">
              <span>Expenditures</span>
              <strong>{formatMoney(totals.cost)}</strong>
            </div>
            <div className="metric">
              <span>Income</span>
              <strong>{formatMoney(totals.income)}</strong>
            </div>
            <div className={`metric ${totals.profit >= 0 ? "positiveMetric" : "negativeMetric"}`}>
              <span>Balance</span>
              <strong>{formatMoney(totals.profit)}</strong>
            </div>
            <div className="metric">
              <span>Investments</span>
              <strong>{investments.length}</strong>
            </div>
          </div>
        </header>

        {error ? <div className="notice">{error}</div> : null}

        <div className="investmentActions" aria-label="Investment import and export actions">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={(event) => void importInvestments(event)} />
          <button type="button" className="loadConfig" onClick={() => startImport("legacy")} disabled={importing}>
            <FileUp size={17} />
            {importing && importMode === "legacy" ? "Importing..." : "Import Legacy"}
          </button>
          <button type="button" className="loadConfig" onClick={() => startImport("native")} disabled={importing}>
            <FileUp size={17} />
            {importing && importMode === "native" ? "Importing..." : "Import JSON"}
          </button>
          <button type="button" className="loadConfig" onClick={exportInvestments} disabled={investments.length === 0}>
            <Download size={17} />
            Export JSON
          </button>
          <button type="button" className="loadConfig" onClick={() => setImageMergerOpen(true)}>
            <Images size={17} />
            Extra Tools
          </button>
        </div>

        <section className="investmentChartPanel" aria-label="Investment value by date chart">
          <div className="investmentChartHeader">
            <div>
              <span>DateTime by Value</span>
              <strong>Income vs Expenditures</strong>
            </div>
            <div className="chartHeaderActions">
              {showChart ? (
                <div className="chartModeTabs" role="tablist" aria-label="Chart display mode">
                  <button
                    type="button"
                    className={chartMode === "line" ? "active" : ""}
                    onClick={() => setChartMode("line")}
                    role="tab"
                    aria-selected={chartMode === "line"}
                  >
                    <LineChart size={16} />
                    Line
                  </button>
                  <button
                    type="button"
                    className={chartMode === "bar" ? "active" : ""}
                    onClick={() => setChartMode("bar")}
                    role="tab"
                    aria-selected={chartMode === "bar"}
                  >
                    <BarChart3 size={16} />
                    Bar
                  </button>
                </div>
              ) : null}
              <button className="secondaryButton" type="button" onClick={() => setShowChart((currentValue) => !currentValue)}>
                {showChart ? "Hide Graph" : "Show Graph"}
              </button>
            </div>
          </div>

          {!showChart ? null : chart.points.length === 0 ? (
            <div className="empty">No chart data yet.</div>
          ) : (
            <div className="investmentChartWrap">
              <svg className="investmentChart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Income and expenditure chart">
                <line
                  className="chartAxis"
                  x1={chart.padding.left}
                  x2={chart.width - chart.padding.right}
                  y1={chart.padding.top + chart.plotHeight}
                  y2={chart.padding.top + chart.plotHeight}
                />
                <line
                  className="chartAxis"
                  x1={chart.padding.left}
                  x2={chart.padding.left}
                  y1={chart.padding.top}
                  y2={chart.padding.top + chart.plotHeight}
                />

                {chart.timeTicks.map((timestamp) => {
                  const x = chart.getX(timestamp);

                  return (
                    <g key={`time-${timestamp}`}>
                      <line className="chartGridLine" x1={x} x2={x} y1={chart.padding.top} y2={chart.padding.top + chart.plotHeight} />
                      <text className="chartTick" x={x} y={chart.height - 8} textAnchor="middle">
                        {formatDate(new Date(timestamp).toISOString())}
                      </text>
                    </g>
                  );
                })}

                {chart.amountTicks.map((amount) => {
                  const y = chart.getY(amount);

                  return (
                    <g key={`amount-${amount}`}>
                      <line className="chartGridLine" x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={y} y2={y} />
                      <text className="chartTick" x={chart.padding.left - 10} y={y + 4} textAnchor="end">
                        {formatUsd(amount)}
                      </text>
                    </g>
                  );
                })}

                {chartMode === "line" ? (
                  <>
                    {chart.expenditureLine ? <polyline className="chartLine expenditure" points={chart.expenditureLine} /> : null}
                    {chart.incomeLine ? <polyline className="chartLine income" points={chart.incomeLine} /> : null}
                  </>
                ) : null}

                {chart.points.map((point) => {
                  const x = chart.getX(point.timestamp);
                  const y = chart.getY(point.amount);
                  const className = point.kind === "income" ? "income" : "expenditure";

                  return chartMode === "bar" ? (
                    <rect
                      className={`chartBar ${className}`}
                      key={point.id}
                      x={x - 4}
                      y={y}
                      width={8}
                      height={Math.max(2, chart.padding.top + chart.plotHeight - y)}
                      rx={4}
                    >
                      <title>{`${point.label} - ${formatMoney(point.amount)} - ${formatDate(new Date(point.timestamp).toISOString())}`}</title>
                    </rect>
                  ) : (
                    <circle className={`chartDot ${className}`} key={point.id} cx={x} cy={y} r={4.5}>
                      <title>{`${point.label} - ${formatMoney(point.amount)} - ${formatDate(new Date(point.timestamp).toISOString())}`}</title>
                    </circle>
                  );
                })}
              </svg>
              <div className="chartLegend" aria-label="Chart legend">
                <span>
                  <i className="income" />
                  Income
                </span>
                <span>
                  <i className="expenditure" />
                  Expenditures
                </span>
              </div>
            </div>
          )}
        </section>

        <div className="investmentMobileTabs" role="tablist" aria-label="Investment views">
          <button
            type="button"
            className={mobileView === "detail" ? "active" : ""}
            onClick={() => setMobileView("detail")}
            role="tab"
            aria-selected={mobileView === "detail"}
          >
            Details
          </button>
          <button
            type="button"
            className={mobileView === "list" ? "active" : ""}
            onClick={() => setMobileView("list")}
            role="tab"
            aria-selected={mobileView === "list"}
          >
            List
          </button>
          <button
            type="button"
            className={mobileView === "add" ? "active" : ""}
            onClick={() => setMobileView("add")}
            role="tab"
            aria-selected={mobileView === "add"}
          >
            Add
          </button>
        </div>

        <section className="investmentGrid">
          <aside
            className={`investmentSidebar ${mobileView === "detail" ? "" : "mobileActive"} ${
              mobileView === "list" ? "showMobileList" : "showMobileAdd"
            }`}
            aria-label="Investment list"
          >
            <div className="investmentPanelHeader">
              <div>
                <span>Portfolio</span>
                <strong>{formatMoney(totals.profit)}</strong>
              </div>
              <button type="button" onClick={() => void loadInvestments()} aria-label="Refresh investments" title="Refresh investments">
                <RefreshCw size={16} />
              </button>
            </div>

            <div className={`investmentFormWrap ${showInvestmentForm ? "open" : ""} ${mobileView === "add" ? "forceOpen" : ""}`}>
              <button
                className="investmentAddToggle"
                type="button"
                onClick={() => setShowInvestmentForm((currentValue) => !currentValue)}
                aria-expanded={showInvestmentForm || mobileView === "add"}
              >
                <Plus size={17} />
                Add Expenditure
              </button>

              <form className="investmentForm" onSubmit={createInvestment}>
                <label>
                  <span>Name</span>
                  <input value={investmentName} onChange={(event) => setInvestmentName(event.target.value)} placeholder="Phone batch, Contabo" />
                </label>
                <label>
                  <span>Cost</span>
                  <input
                    value={investmentCost}
                    onChange={(event) => setInvestmentCost(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    value={investmentDescription}
                    onChange={(event) => setInvestmentDescription(event.target.value)}
                    placeholder="Notes for this expenditure"
                  />
                </label>
                <button className="loadConfig" type="submit" disabled={savingInvestment}>
                  <Plus size={17} />
                  {savingInvestment ? "Adding..." : "Add Investment"}
                </button>
              </form>
            </div>

            <div className={`investmentListWrap ${mobileView === "list" ? "mobileActive" : ""}`}>
              <div className="investmentListHeader">
                <span>{investmentListTab === "expenditures" ? "Expenditures" : "ROI"}</span>
                <strong>{visibleInvestments.length}</strong>
              </div>
              <div className="investmentListTabs" role="tablist" aria-label="Investment balance groups">
                <button
                  type="button"
                  className={investmentListTab === "expenditures" ? "active" : ""}
                  onClick={() => setInvestmentListTab("expenditures")}
                  role="tab"
                  aria-selected={investmentListTab === "expenditures"}
                >
                  <TrendingDown size={15} />
                  <span>Expenditures</span>
                  <strong>{investmentGroups.expenditures.length}</strong>
                </button>
                <button
                  type="button"
                  className={investmentListTab === "roi" ? "active" : ""}
                  onClick={() => setInvestmentListTab("roi")}
                  role="tab"
                  aria-selected={investmentListTab === "roi"}
                >
                  <TrendingUp size={15} />
                  <span>ROI</span>
                  <strong>{investmentGroups.roi.length}</strong>
                </button>
              </div>
              <div className="investmentListTools">
                <label className="investmentSearch">
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={investmentQuery}
                    onChange={(event) => setInvestmentQuery(event.target.value)}
                    placeholder="Search investments"
                    aria-label="Search investments"
                  />
                </label>
                <div className="investmentSort" aria-label="Sort investments">
                  <button
                    type="button"
                    className={investmentSortKey === "name" ? "active" : ""}
                    onClick={() => toggleInvestmentSort("name")}
                  >
                    Name {investmentSortKey === "name" ? investmentSortDirection.toUpperCase() : ""}
                  </button>
                  <button
                    type="button"
                    className={investmentSortKey === "cost" ? "active" : ""}
                    onClick={() => toggleInvestmentSort("cost")}
                  >
                    Cost {investmentSortKey === "cost" ? investmentSortDirection.toUpperCase() : ""}
                  </button>
                  <button
                    type="button"
                    className={investmentSortKey === "created_at" ? "active" : ""}
                    onClick={() => toggleInvestmentSort("created_at")}
                  >
                    Date {investmentSortKey === "created_at" ? investmentSortDirection.toUpperCase() : ""}
                  </button>
                </div>
              </div>
              <div className="investmentList">
                {loading ? (
                  <div className="empty">Loading investments...</div>
                ) : investments.length === 0 ? (
                  <div className="empty">No investments yet.</div>
                ) : visibleInvestments.length === 0 ? (
                  <div className="empty">
                    {investmentQuery.trim()
                      ? "No investments match your search."
                      : investmentListTab === "expenditures"
                        ? "No negative-balance expenditures."
                        : "No ROI investments yet."}
                  </div>
                ) : (
                  visibleInvestments.map((investment) => {
                    const profit = getProfit(investment);

                    return (
                      <button
                        className={`investmentItem ${selectedInvestment?.id === investment.id ? "active" : ""}`}
                        key={investment.id}
                        type="button"
                        onClick={() => {
                          setSelectedInvestmentId(investment.id);
                          setMobileView("detail");
                        }}
                      >
                        <span>
                          <strong>{getInvestmentName(investment)}</strong>
                          <small>{investment.income_count} income records</small>
                        </span>
                        <b className={profit >= 0 ? "positiveText" : "negativeText"}>{formatMoney(profit)}</b>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          <section className={`investmentDetail ${mobileView === "detail" ? "mobileActive" : ""}`} aria-label="Investment detail">
            {selectedInvestment ? (
              <>
                <div className="detailHeader">
                  <div>
                    <span>Selected Investment</span>
                    <h2>{getInvestmentName(selectedInvestment)}</h2>
                    <p>{selectedInvestment.description || "No description."}</p>
                  </div>
                  <div className="detailActions">
                    <button
                      className="iconButton"
                      type="button"
                      onClick={() => beginEditInvestment(selectedInvestment)}
                      aria-label="Edit investment"
                      title="Edit investment"
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="dangerIcon"
                      type="button"
                      onClick={() => void deleteInvestment(selectedInvestment.id)}
                      aria-label="Delete investment"
                      title="Delete investment"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>

                {editingInvestmentId === selectedInvestment.id ? (
                  <form className="editInvestmentForm" onSubmit={updateInvestment}>
                    <label>
                      <span>Name</span>
                      <input value={editInvestmentName} onChange={(event) => setEditInvestmentName(event.target.value)} />
                    </label>
                    <label>
                      <span>Cost</span>
                      <input value={editInvestmentCost} onChange={(event) => setEditInvestmentCost(event.target.value)} inputMode="decimal" />
                    </label>
                    <label>
                      <span>Description</span>
                      <input value={editInvestmentDescription} onChange={(event) => setEditInvestmentDescription(event.target.value)} />
                    </label>
                    <div className="editActions">
                      <button className="loadConfig" type="submit" disabled={savingInvestmentEdit}>
                        <Check size={17} />
                        {savingInvestmentEdit ? "Saving..." : "Save"}
                      </button>
                      <button className="secondaryButton" type="button" onClick={cancelEditInvestment}>
                        <X size={17} />
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                <div className="investmentMetrics">
                  <div>
                    <ReceiptText size={18} />
                    <span>Cost</span>
                    <strong>{formatMoney(selectedInvestment.cost)}</strong>
                  </div>
                  <div>
                    <Banknote size={18} />
                    <span>Income</span>
                    <strong>{formatMoney(selectedInvestment.total_income)}</strong>
                  </div>
                  <div>
                    {getProfit(selectedInvestment) >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    <span>Profit / Loss</span>
                    <strong className={getProfit(selectedInvestment) >= 0 ? "positiveText" : "negativeText"}>
                      {formatMoney(getProfit(selectedInvestment))}
                    </strong>
                  </div>
                </div>

                <form className="incomeForm" onSubmit={createIncome}>
                  <label>
                    <span>Income Amount</span>
                    <input
                      value={incomeAmount}
                      onChange={(event) => setIncomeAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <input
                      value={incomeDescription}
                      onChange={(event) => setIncomeDescription(event.target.value)}
                      placeholder="Daily return, payout, refund"
                    />
                  </label>
                  <button className="loadConfig" type="submit" disabled={savingIncome}>
                    <Plus size={17} />
                    {savingIncome ? "Adding..." : "Add Income"}
                  </button>
                </form>

                <div className="incomeList">
                  <div className="incomeListHeader">
                    <span>Income History</span>
                    <strong>{selectedInvestment.incomes.length}</strong>
                  </div>

                  {selectedInvestment.incomes.length === 0 ? (
                    <div className="empty">No income records for this investment yet.</div>
                  ) : (
                    selectedInvestment.incomes.map((income) => (
                      <div className="incomeItem" key={income.id}>
                        {editingIncomeId === income.id ? (
                          <form className="incomeEditForm" onSubmit={(event) => void updateIncome(event, income.id)}>
                            <label>
                              <span>Amount</span>
                              <input value={editIncomeAmount} onChange={(event) => setEditIncomeAmount(event.target.value)} inputMode="decimal" />
                            </label>
                            <label>
                              <span>Description</span>
                              <input value={editIncomeDescription} onChange={(event) => setEditIncomeDescription(event.target.value)} />
                            </label>
                            <div className="incomeItemActions">
                              <button type="submit" disabled={savingIncomeEditId === income.id} aria-label="Save income" title="Save income">
                                <Check size={16} />
                              </button>
                              <button type="button" onClick={cancelEditIncome} aria-label="Cancel income edit" title="Cancel">
                                <X size={16} />
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div>
                              <strong>{formatMoney(income.amount)}</strong>
                              <span>{income.description || "Income"}</span>
                              <small>{formatDate(income.created_at)}</small>
                            </div>
                            <div className="incomeItemActions">
                              <button type="button" onClick={() => beginEditIncome(income)} aria-label="Edit income" title="Edit income">
                                <Pencil size={16} />
                              </button>
                              <button
                                className="dangerIcon"
                                type="button"
                                onClick={() => void deleteIncome(income.id)}
                                aria-label="Delete income"
                                title="Delete income"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="investmentEmpty">
                <WalletCards size={34} />
                <strong>Select or create an investment</strong>
                <span>Income records will attach to the selected expenditure.</span>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>

    {imageMergerOpen ? (
      <div className="toolModal" role="dialog" aria-modal="true" aria-label="Image merger">
        <button className="toolModalBackdrop" type="button" aria-label="Close image merger" onClick={() => setImageMergerOpen(false)} />
        <div className="toolDialog imageMergerDialog">
          <div className="toolModalBar">
            <div>
              <span>Extra Tools</span>
              <strong>Image Merger</strong>
            </div>
            <button type="button" aria-label="Close image merger" onClick={() => setImageMergerOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="imageMergerBody">
            <input
              ref={imageMergeInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                if (event.target.files) {
                  addImageMergeFiles(event.target.files);
                }
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="imageDropzone"
              onClick={() => imageMergeInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addImageMergeFiles(event.dataTransfer.files);
              }}
            >
              <FolderOpen size={28} />
              <strong>Drop screenshots here</strong>
              <span>or click to choose images from Windows Explorer</span>
            </button>

            {imageMergeError ? <div className="notice">{imageMergeError}</div> : null}

            <div className="imageMergeList">
              {imageMergeItems.length === 0 ? (
                <div className="imageMergeEmpty">No screenshots selected.</div>
              ) : (
                imageMergeItems.map((item, index) => (
                  <div className="imageMergeItem" key={item.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="" />
                    <div>
                      <strong>{item.name}</strong>
                      <span>{Math.max(1, Math.round(item.size / 1024))} KB</span>
                    </div>
                    <div className="imageMergeItemActions">
                      <button type="button" onClick={() => moveImageMergeItem(item.id, -1)} disabled={index === 0} aria-label="Move image up">
                        <MoveUp size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImageMergeItem(item.id, 1)}
                        disabled={index === imageMergeItems.length - 1}
                        aria-label="Move image down"
                      >
                        <MoveDown size={16} />
                      </button>
                      <button type="button" className="dangerIcon" onClick={() => removeImageMergeItem(item.id)} aria-label="Remove image">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="toolModalFooter">
            <button type="button" className="secondaryButton" onClick={clearImageMergeItems} disabled={imageMergeItems.length === 0 || mergingImages}>
              Clear
            </button>
            <button type="button" className="loadConfig" onClick={() => void exportMergedImage()} disabled={imageMergeItems.length === 0 || mergingImages}>
              <Download size={17} />
              {mergingImages ? "Merging..." : "Export PNG"}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
