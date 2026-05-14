"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Check,
  Download,
  FileUp,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";

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
  const [editingInvestmentId, setEditingInvestmentId] = useState<number | null>(null);
  const [editingIncomeId, setEditingIncomeId] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
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

  const visibleInvestments = investmentGroups[investmentListTab];

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

  return (
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
          </div>

          <div className="summary" aria-label="Investment summary">
            <div className="metric">
              <span>Expenditures</span>
              <strong>{formatUsd(totals.cost)}</strong>
            </div>
            <div className="metric">
              <span>Income</span>
              <strong>{formatUsd(totals.income)}</strong>
            </div>
            <div className={`metric ${totals.profit >= 0 ? "positiveMetric" : "negativeMetric"}`}>
              <span>Balance</span>
              <strong>{formatUsd(totals.profit)}</strong>
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
        </div>

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
              <div className="investmentList">
                {loading ? (
                  <div className="empty">Loading investments...</div>
                ) : investments.length === 0 ? (
                  <div className="empty">No investments yet.</div>
                ) : visibleInvestments.length === 0 ? (
                  <div className="empty">
                    {investmentListTab === "expenditures" ? "No negative-balance expenditures." : "No ROI investments yet."}
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
                        <b className={profit >= 0 ? "positiveText" : "negativeText"}>{formatUsd(profit)}</b>
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
  );
}
