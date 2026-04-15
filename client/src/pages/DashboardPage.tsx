import { useEffect, useMemo, useState } from "react";
import type { Expense, Participant } from "@splitmint/shared";
import { api, formatCurrency } from "../lib/api";

type Props = {
  user: { id: string; email: string; createdAt: string };
  onLogout: () => Promise<void>;
};

type GroupView = {
  id: string;
  name: string;
  ownerParticipantId: string;
  participantCount: number;
  participants: Participant[];
};

const COLORS = ["teal", "orange", "blue", "green", "pink"];

export default function DashboardPage({ user, onLogout }: Props) {
  const [groups, setGroups] = useState<GroupView[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<{
    participants: Participant[];
    matrixEntries: Array<{ fromParticipantId: string; toParticipantId: string; amountMinor: number }>;
    netByParticipant: Record<string, number>;
    ownerSummary: { ownerOwedMinor: number; ownerOwesMinor: number } | null;
  } | null>(null);
  const [settlements, setSettlements] = useState<Array<{ fromParticipantId: string; toParticipantId: string; amountMinor: number }>>([]);
  const [error, setError] = useState("");
  const [mintSenseStatus, setMintSenseStatus] = useState<"unknown" | "enabled" | "disabled">("unknown");

  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupName, setEditingGroupName] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState("");
  const [editingParticipantName, setEditingParticipantName] = useState("");
  const [participantColor, setParticipantColor] = useState(COLORS[0]);

  const [filters, setFilters] = useState({
    query: "",
    participantId: "",
    startDate: "",
    endDate: "",
    minAmountMinor: "",
    maxAmountMinor: ""
  });

  const [mintText, setMintText] = useState("");
  const [parsedExpenseCategory, setParsedExpenseCategory] = useState("");
  const [mintSummary, setMintSummary] = useState("");
  const [mintTopCategory, setMintTopCategory] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<Array<{
    fromParticipantId: string;
    toParticipantId: string;
    amountMinor: number;
    reason?: string;
  }>>([]);

  const [expenseForm, setExpenseForm] = useState({
    editingExpenseId: "",
    description: "",
    amountMinor: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    payerParticipantId: "",
    splitMode: "equal" as "equal" | "custom" | "percentage",
    participantIds: [] as string[],
    customShares: "",
    percentageShares: ""
  });

  const selectedGroup = useMemo(() => groups.find((g) => g.id === selectedGroupId) || null, [groups, selectedGroupId]);

  useEffect(() => {
    setEditingGroupName(selectedGroup?.name || "");
  }, [selectedGroup?.id, selectedGroup?.name]);

  const participantMap = useMemo(
    () => Object.fromEntries((selectedGroup?.participants || []).map((p) => [p.id, p.name])),
    [selectedGroup]
  );

  const contributionData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      totals.set(expense.payerParticipantId, (totals.get(expense.payerParticipantId) || 0) + expense.amountMinor);
    }
    return (selectedGroup?.participants || []).map((p) => ({ name: p.name, totalMinor: totals.get(p.id) || 0 }));
  }, [expenses, selectedGroup]);

  async function loadGroups() {
    const list = await api.listGroups();
    const loaded: GroupView[] = [];
    for (const g of list.groups) {
      const detail = await api.getGroup(g.id);
      loaded.push({
        id: g.id,
        name: g.name,
        ownerParticipantId: g.ownerParticipantId,
        participantCount: g.participantCount,
        participants: detail.group.participants
      });
    }
    setGroups(loaded);
    if (!selectedGroupId && loaded[0]) {
      setSelectedGroupId(loaded[0].id);
      const ownerParticipant = loaded[0].participants.find((p) => p.isOwnerParticipant);
      setExpenseForm((prev) => ({
        ...prev,
        payerParticipantId: ownerParticipant?.id || "",
        participantIds: loaded[0].participants.map((p) => p.id)
      }));
    }
  }

  async function loadGroupData(groupId: string, currentFilters = filters) {
    const [expenseRes, balanceRes, settlementRes, groupRes] = await Promise.all([
      api.listExpenses(groupId, currentFilters),
      api.balances(groupId),
      api.settlements(groupId),
      api.getGroup(groupId)
    ]);

    setExpenses(expenseRes.expenses);
    setBalances(balanceRes);
    setSettlements(settlementRes.recommendations);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? {
      ...g,
      name: groupRes.group.name,
      participants: groupRes.group.participants,
      ownerParticipantId: groupRes.group.ownerParticipantId,
      participantCount: groupRes.group.participantCount
    } : g)));

    const ownerParticipant = groupRes.group.participants.find((p) => p.isOwnerParticipant);
    const participantIds = new Set(groupRes.group.participants.map((p) => p.id));

    setExpenseForm((prev) => ({
      ...prev,
      payerParticipantId: participantIds.has(prev.payerParticipantId) ? prev.payerParticipantId : (ownerParticipant?.id || ""),
      participantIds: prev.participantIds.length
        ? prev.participantIds.filter((id) => participantIds.has(id))
        : groupRes.group.participants.map((p) => p.id)
    }));
  }

  useEffect(() => {
    loadGroups().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;
    setParsedExpenseCategory("");
    setMintSummary("");
    setMintTopCategory("");
    setAiSuggestions([]);
    loadGroupData(selectedGroupId).catch((err) => setError(err.message));
  }, [selectedGroupId]);

  async function createGroup() {
    if (!newGroupName.trim()) {
      setError("Please enter a group name");
      return;
    }
    setError("");
    try {
      await api.createGroup(newGroupName.trim());
      setNewGroupName("");
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    }
  }

  async function addParticipant() {
    if (!selectedGroupId) {
      setError("Please select a group first");
      return;
    }
    if (!participantName.trim()) {
      setError("Please enter a participant name");
      return;
    }
    setError("");
    try {
      await api.addParticipant(selectedGroupId, { name: participantName.trim(), avatarColor: participantColor });
      setParticipantName("");
      await loadGroupData(selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add participant");
    }
  }

  async function renameGroup() {
    if (!selectedGroupId) {
      setError("Please select a group first");
      return;
    }
    if (!editingGroupName.trim()) {
      setError("Group name cannot be empty");
      return;
    }

    setError("");
    try {
      await api.updateGroup(selectedGroupId, editingGroupName.trim());
      await loadGroups();
      await loadGroupData(selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename group");
    }
  }

  async function deleteSelectedGroup() {
    if (!selectedGroupId) {
      setError("Please select a group first");
      return;
    }
    const confirmed = window.confirm("Delete this group and all related data?");
    if (!confirmed) return;

    setError("");
    try {
      await api.deleteGroup(selectedGroupId);
      setSelectedGroupId("");
      setExpenses([]);
      setBalances(null);
      setSettlements([]);
      setAiSuggestions([]);
      setMintSummary("");
      setMintTopCategory("");
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
    }
  }

  async function removeParticipant(participantId: string) {
    if (!selectedGroupId) return;
    const confirmed = window.confirm(
      "Remove this participant? Any expenses involving this participant will also be deleted."
    );
    if (!confirmed) return;

    try {
      const result = await api.removeParticipant(selectedGroupId, participantId);
      if ((result.removedExpenseCount || 0) > 0) {
        setError(`Participant removed. ${result.removedExpenseCount} related expense(s) were also deleted.`);
      }
      await loadGroupData(selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove participant");
    }
  }

  async function updateParticipant(participantId: string) {
    if (!selectedGroupId) return;
    if (!editingParticipantName.trim()) {
      setError("Participant name cannot be empty");
      return;
    }

    setError("");
    try {
      await api.updateParticipant(selectedGroupId, participantId, { name: editingParticipantName.trim() });
      setEditingParticipantId("");
      setEditingParticipantName("");
      await loadGroupData(selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update participant");
    }
  }

  function parseCustomShares(): Array<{ participantId: string; amountMinor: number }> {
    if (!expenseForm.customShares.trim()) return [];
    return expenseForm.customShares.split(",").map((item) => {
      const [participantId, amount] = item.split(":").map((v) => v.trim());
      return { participantId, amountMinor: Number(amount) };
    });
  }

  function parsePercentageShares(): Array<{ participantId: string; percentageBasisPoints: number }> {
    if (!expenseForm.percentageShares.trim()) return [];
    return expenseForm.percentageShares.split(",").map((item) => {
      const [participantId, percent] = item.split(":").map((v) => v.trim());
      return { participantId, percentageBasisPoints: Number(percent) * 100 };
    });
  }

  async function submitExpense() {
    if (!selectedGroupId) {
      setError("Please select a group before creating an expense");
      return;
    }
    setError("");

    if (!expenseForm.description.trim()) {
      setError("Description is required");
      return;
    }
    if (!expenseForm.amountMinor || Number(expenseForm.amountMinor) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (!expenseForm.payerParticipantId) {
      setError("Please select a payer");
      return;
    }
    if (!expenseForm.participantIds.length) {
      setError("Please select at least one split participant");
      return;
    }

    const payload: Record<string, unknown> = {
      description: expenseForm.description,
      amountMinor: Number(expenseForm.amountMinor),
      expenseDate: new Date(expenseForm.expenseDate).toISOString(),
      payerParticipantId: expenseForm.payerParticipantId,
      splitMode: expenseForm.splitMode,
      participantIds: expenseForm.participantIds,
      customShares: expenseForm.splitMode === "custom" ? parseCustomShares() : undefined,
      percentageShares: expenseForm.splitMode === "percentage" ? parsePercentageShares() : undefined
    };

    try {
      if (expenseForm.editingExpenseId) {
        await api.updateExpense(selectedGroupId, expenseForm.editingExpenseId, payload);
      } else {
        await api.createExpense(selectedGroupId, payload);
      }

      setExpenseForm((prev) => ({
        ...prev,
        editingExpenseId: "",
        description: "",
        amountMinor: "",
        customShares: "",
        percentageShares: ""
      }));
      setParsedExpenseCategory("");

      await loadGroupData(selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create expense");
    }
  }

  async function deleteExpense(expenseId: string) {
    if (!selectedGroupId) return;
    setError("");
    try {
      await api.deleteExpense(selectedGroupId, expenseId);
      await loadGroupData(selectedGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete expense");
    }
  }

  async function applyFilters() {
    if (!selectedGroupId) return;
    await loadGroupData(selectedGroupId, filters);
  }

  async function resetFilters() {
    const empty = {
      query: "",
      participantId: "",
      startDate: "",
      endDate: "",
      minAmountMinor: "",
      maxAmountMinor: ""
    };
    setFilters(empty);
    if (selectedGroupId) await loadGroupData(selectedGroupId, empty);
  }

  async function runMintSense() {
    if (!selectedGroupId || !mintText.trim()) return;
    try {
      const parsed = await api.parseExpense(mintText, selectedGroupId);
      const data = parsed.parsed;
      setMintSenseStatus("enabled");
      setExpenseForm((prev) => ({
        ...prev,
        description: String(data.description || prev.description),
        amountMinor: String(data.amountMinor || prev.amountMinor),
        expenseDate: String(data.expenseDate || prev.expenseDate).slice(0, 10),
        payerParticipantId: String(data.payerParticipantId || prev.payerParticipantId),
        splitMode: (data.splitModeCandidate as "equal" | "custom" | "percentage") || prev.splitMode,
        participantIds: Array.isArray(data.participantIds)
          ? data.participantIds.map((v) => String(v))
          : prev.participantIds
      }));
      setParsedExpenseCategory(String(data.expenseCategory || ""));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not parse expense";
      if (message.toLowerCase().includes("missing api key")) {
        setMintSenseStatus("disabled");
      }
      setError(message);
    }
  }

  async function runMintSummary() {
    if (!selectedGroupId) {
      setError("Please select a group first");
      return;
    }
    setError("");
    try {
      const result = await api.groupSummary(selectedGroupId);
      setMintSenseStatus("enabled");
      setMintSummary(result.summary.summary || "");
      setMintTopCategory(result.summary.topCategory || "");
      setAiSuggestions(result.summary.aiSettlementSuggestions || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not summarize group";
      if (message.toLowerCase().includes("missing api key")) {
        setMintSenseStatus("disabled");
      }
      setError(message);
    }
  }

  const totalSpend = expenses.reduce((sum, e) => sum + e.amountMinor, 0);

  return (
    <main className="min-h-screen px-4 py-5 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl bg-white/80 p-5 shadow-card backdrop-blur animate-rise">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl text-night">SplitMint Dashboard</h1>
              <p className="text-sm text-ink/75">Signed in as {user.email}</p>
            </div>
            <button className="rounded-xl bg-night px-4 py-2 text-sm font-semibold text-white" onClick={() => onLogout()}>
              Logout
            </button>
          </div>
        </header>

        {error && <p className="rounded-xl bg-coral/10 p-3 text-coral">{error}</p>}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl bg-white/85 p-4 shadow-card">
            <p className="text-xs uppercase tracking-wide text-ink/70">Total spend</p>
            <p className="mt-2 font-display text-2xl">{formatCurrency(totalSpend)}</p>
          </article>
          <article className="rounded-2xl bg-white/85 p-4 shadow-card">
            <p className="text-xs uppercase tracking-wide text-ink/70">Owner is owed</p>
            <p className="mt-2 font-display text-2xl text-mint">{formatCurrency(balances?.ownerSummary?.ownerOwedMinor || 0)}</p>
          </article>
          <article className="rounded-2xl bg-white/85 p-4 shadow-card">
            <p className="text-xs uppercase tracking-wide text-ink/70">Owner owes</p>
            <p className="mt-2 font-display text-2xl text-coral">{formatCurrency(balances?.ownerSummary?.ownerOwesMinor || 0)}</p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_2fr]">
          <aside className="rounded-2xl bg-white/85 p-4 shadow-card space-y-4">
            <h2 className="font-display text-xl">Groups</h2>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-ink/20 px-3 py-2"
                placeholder="New group"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
              <button className="rounded-xl bg-mint px-3 py-2 text-white" onClick={() => createGroup()}>
                Add
              </button>
            </div>
            <div className="space-y-2">
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={`w-full rounded-xl px-3 py-2 text-left ${selectedGroupId === group.id ? "bg-night text-white" : "bg-ink/5"}`}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <div className="font-semibold">{group.name}</div>
                  <div className="text-xs opacity-80">{group.participantCount} participants</div>
                </button>
              ))}
            </div>

            <div className="border-t border-ink/10 pt-4 space-y-2">
              <h3 className="font-semibold">Manage selected group</h3>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-ink/20 px-3 py-2 text-sm"
                  placeholder="Rename group"
                  value={editingGroupName}
                  onChange={(e) => setEditingGroupName(e.target.value)}
                />
                <button className="rounded-xl bg-night px-3 py-2 text-sm text-white" onClick={() => renameGroup()}>
                  Save
                </button>
              </div>
              <button className="rounded-xl bg-coral px-3 py-2 text-sm text-white" onClick={() => deleteSelectedGroup()}>
                Delete group
              </button>
            </div>

            <div className="border-t border-ink/10 pt-4 space-y-2">
              <h3 className="font-semibold">Participants</h3>
              {selectedGroup?.participants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between rounded-lg bg-ink/5 px-2 py-1.5 text-sm">
                  {editingParticipantId === participant.id ? (
                    <input
                      className="flex-1 rounded-lg border border-ink/20 px-2 py-1 text-sm"
                      value={editingParticipantName}
                      onChange={(e) => setEditingParticipantName(e.target.value)}
                    />
                  ) : (
                    <span>{participant.name}{participant.isOwnerParticipant ? " (owner)" : ""}</span>
                  )}
                  {!participant.isOwnerParticipant && (
                    <div className="space-x-2">
                      {editingParticipantId === participant.id ? (
                        <>
                          <button className="text-night" onClick={() => updateParticipant(participant.id)}>Save</button>
                          <button
                            className="text-ink/70"
                            onClick={() => {
                              setEditingParticipantId("");
                              setEditingParticipantName("");
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="text-ink/80"
                            onClick={() => {
                              setEditingParticipantId(participant.id);
                              setEditingParticipantName(participant.name);
                            }}
                          >
                            Edit
                          </button>
                          <button className="text-coral" onClick={() => removeParticipant(participant.id)}>Remove</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-ink/20 px-2 py-1.5 text-sm"
                  placeholder="Participant name"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                />
                <select
                  className="rounded-xl border border-ink/20 px-2 py-1.5 text-sm"
                  value={participantColor}
                  onChange={(e) => setParticipantColor(e.target.value)}
                >
                  {COLORS.map((color) => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
                <button className="rounded-xl bg-night px-2 text-white" onClick={() => addParticipant()}>+</button>
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            <article className="rounded-2xl bg-white/85 p-4 shadow-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl">Add or edit expense</h2>
                <span className="text-xs text-ink/70">Money is stored in minor units</span>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <input
                  className="rounded-xl border border-ink/20 px-3 py-2"
                  placeholder="Description"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <input
                  className="rounded-xl border border-ink/20 px-3 py-2"
                  placeholder="Amount minor (e.g. 1299)"
                  value={expenseForm.amountMinor}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, amountMinor: e.target.value }))}
                  type="number"
                />
                <input
                  className="rounded-xl border border-ink/20 px-3 py-2"
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
                  type="date"
                />
                <select
                  className="rounded-xl border border-ink/20 px-3 py-2"
                  value={expenseForm.payerParticipantId}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, payerParticipantId: e.target.value }))}
                >
                  <option value="">Select payer</option>
                  {selectedGroup?.participants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-ink/20 px-3 py-2"
                  value={expenseForm.splitMode}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, splitMode: e.target.value as "equal" | "custom" | "percentage" }))}
                >
                  <option value="equal">Equal</option>
                  <option value="custom">Custom</option>
                  <option value="percentage">Percentage</option>
                </select>
              </div>

              <div className="rounded-xl border border-ink/15 p-3">
                <p className="mb-2 text-sm font-semibold">Split participants</p>
                <div className="flex flex-wrap gap-2">
                  {selectedGroup?.participants.map((p) => {
                    const active = expenseForm.participantIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        className={`rounded-full px-3 py-1 text-sm ${active ? "bg-mint text-white" : "bg-ink/10"}`}
                        onClick={() => setExpenseForm((prev) => ({
                          ...prev,
                          participantIds: active
                            ? prev.participantIds.filter((id) => id !== p.id)
                            : [...prev.participantIds, p.id]
                        }))}
                        type="button"
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                {expenseForm.splitMode === "custom" && (
                  <input
                    className="mt-3 w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                    placeholder="custom: participantId:amountMinor,participantId:amountMinor"
                    value={expenseForm.customShares}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, customShares: e.target.value }))}
                  />
                )}
                {expenseForm.splitMode === "percentage" && (
                  <input
                    className="mt-3 w-full rounded-xl border border-ink/20 px-3 py-2 text-sm"
                    placeholder="percentage: participantId:percent,participantId:percent"
                    value={expenseForm.percentageShares}
                    onChange={(e) => setExpenseForm((prev) => ({ ...prev, percentageShares: e.target.value }))}
                  />
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-night px-4 py-2 text-white" onClick={() => submitExpense()}>
                  {expenseForm.editingExpenseId ? "Update expense" : "Create expense"}
                </button>
                {expenseForm.editingExpenseId && (
                  <button
                    className="rounded-xl bg-ink/10 px-4 py-2"
                    onClick={() => setExpenseForm((prev) => ({ ...prev, editingExpenseId: "" }))}
                  >
                    Cancel edit
                  </button>
                )}
              </div>

              <div className="rounded-xl bg-sand/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">MintSense</h3>
                  {mintSenseStatus === "disabled" && <span className="text-xs text-coral">Disabled: no API key</span>}
                </div>
                <textarea
                  className="mt-2 w-full rounded-xl border border-ink/20 px-3 py-2"
                  rows={3}
                  placeholder="Example: Paid 1250 for lunch today, split equally between me, Alice, Bob"
                  value={mintText}
                  onChange={(e) => setMintText(e.target.value)}
                />
                <button className="mt-2 rounded-xl bg-mint px-4 py-2 text-white" onClick={() => runMintSense()}>
                  Parse and prefill
                </button>
                <button className="mt-2 ml-2 rounded-xl bg-night px-4 py-2 text-white" onClick={() => runMintSummary()}>
                  Generate group summary
                </button>
                {parsedExpenseCategory && <p className="mt-2 text-sm text-ink/70">Suggested category: {parsedExpenseCategory}</p>}
                {(mintTopCategory || mintSummary) && (
                  <div className="mt-3 rounded-xl bg-white p-3 text-sm">
                    {mintTopCategory && <p className="font-semibold">Top category: {mintTopCategory}</p>}
                    {mintSummary && <p className="mt-1 text-ink/80">{mintSummary}</p>}
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-2xl bg-white/85 p-4 shadow-card">
              <h2 className="font-display text-xl">Filters</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <input className="rounded-xl border border-ink/20 px-3 py-2" placeholder="Search description" value={filters.query} onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))} />
                <select className="rounded-xl border border-ink/20 px-3 py-2" value={filters.participantId} onChange={(e) => setFilters((p) => ({ ...p, participantId: e.target.value }))}>
                  <option value="">Any participant</option>
                  {selectedGroup?.participants.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
                </select>
                <input className="rounded-xl border border-ink/20 px-3 py-2" type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : "" }))} />
                <input className="rounded-xl border border-ink/20 px-3 py-2" type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value ? `${e.target.value}T23:59:59.000Z` : "" }))} />
                <input className="rounded-xl border border-ink/20 px-3 py-2" placeholder="Min amount minor" value={filters.minAmountMinor} onChange={(e) => setFilters((p) => ({ ...p, minAmountMinor: e.target.value }))} />
                <input className="rounded-xl border border-ink/20 px-3 py-2" placeholder="Max amount minor" value={filters.maxAmountMinor} onChange={(e) => setFilters((p) => ({ ...p, maxAmountMinor: e.target.value }))} />
              </div>
              <div className="mt-2 flex gap-2">
                <button className="rounded-xl bg-night px-3 py-2 text-white" onClick={() => applyFilters()}>Apply</button>
                <button className="rounded-xl bg-ink/10 px-3 py-2" onClick={() => resetFilters()}>Reset</button>
              </div>
            </article>

            <article className="rounded-2xl bg-white/85 p-4 shadow-card overflow-x-auto">
              <h2 className="font-display text-xl">Expense history</h2>
              <table className="mt-3 w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="text-left text-ink/70">
                    <th className="py-2">Date</th>
                    <th>Description</th>
                    <th>Payer</th>
                    <th>Total</th>
                    <th>Owner impact</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => {
                    const ownerId = selectedGroup?.ownerParticipantId;
                    const ownerShare = expense.shares.find((s) => s.participantId === ownerId)?.amountMinor || 0;
                    const ownerImpact = ownerId === expense.payerParticipantId
                      ? expense.amountMinor - ownerShare
                      : -ownerShare;

                    return (
                      <tr key={expense.id} className="border-t border-ink/10">
                        <td className="py-2">{new Date(expense.expenseDate).toLocaleDateString()}</td>
                        <td>{expense.description}</td>
                        <td>{participantMap[expense.payerParticipantId] || "Unknown"}</td>
                        <td>{formatCurrency(expense.amountMinor)}</td>
                        <td className={ownerImpact >= 0 ? "text-mint" : "text-coral"}>{formatCurrency(ownerImpact)}</td>
                        <td className="space-x-2">
                          <button className="text-ink/80" onClick={() => setExpenseForm((prev) => ({
                            ...prev,
                            editingExpenseId: expense.id,
                            description: expense.description,
                            amountMinor: String(expense.amountMinor),
                            expenseDate: expense.expenseDate.slice(0, 10),
                            payerParticipantId: expense.payerParticipantId,
                            splitMode: expense.splitMode,
                            participantIds: expense.shares.map((s) => s.participantId),
                            customShares: expense.splitMode === "custom"
                              ? expense.shares.map((s) => `${s.participantId}:${s.amountMinor}`).join(",")
                              : "",
                            percentageShares: expense.splitMode === "percentage"
                              ? expense.shares.map((s) => `${s.participantId}:${((s.percentageBasisPoints || 0) / 100).toFixed(2)}`).join(",")
                              : ""
                          }))}>Edit</button>
                          <button className="text-coral" onClick={() => deleteExpense(expense.id)}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                  {!expenses.length && (
                    <tr>
                      <td className="py-4 text-ink/60" colSpan={6}>No expenses found for this group and filter set.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </article>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-2xl bg-white/85 p-4 shadow-card overflow-x-auto">
                <h2 className="font-display text-xl">Balance matrix</h2>
                <table className="mt-3 w-full min-w-[400px] text-sm">
                  <thead>
                    <tr className="text-left text-ink/70">
                      <th className="py-2">From</th>
                      <th>To</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances?.matrixEntries.map((entry) => (
                      <tr key={`${entry.fromParticipantId}-${entry.toParticipantId}`} className="border-t border-ink/10">
                        <td className="py-2">{participantMap[entry.fromParticipantId]}</td>
                        <td>{participantMap[entry.toParticipantId]}</td>
                        <td>{formatCurrency(entry.amountMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>

              <article className="rounded-2xl bg-white/85 p-4 shadow-card">
                <h2 className="font-display text-xl">Settlement suggestions</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {settlements.map((item, idx) => (
                    <li key={idx} className="rounded-lg bg-ink/5 px-3 py-2">
                      {participantMap[item.fromParticipantId]} pays {participantMap[item.toParticipantId]} {formatCurrency(item.amountMinor)}
                    </li>
                  ))}
                  {!settlements.length && <li className="text-ink/60">No transfers needed.</li>}
                </ul>
                {aiSuggestions.length > 0 && (
                  <>
                    <h3 className="mt-4 font-semibold text-sm">AI settlement paths</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {aiSuggestions.map((item, idx) => (
                        <li key={`${item.fromParticipantId}-${item.toParticipantId}-${idx}`} className="rounded-lg bg-night/5 px-3 py-2">
                          {participantMap[item.fromParticipantId]} pays {participantMap[item.toParticipantId]} {formatCurrency(item.amountMinor)}
                          {item.reason ? ` — ${item.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            </section>

            <article className="rounded-2xl bg-white/85 p-4 shadow-card">
              <h2 className="font-display text-xl">Color-coded ledger</h2>
              <div className="mt-3 space-y-2">
                {selectedGroup?.participants.map((participant) => {
                  const netMinor = balances?.netByParticipant?.[participant.id] || 0;
                  const ledgerClass = netMinor > 0 ? "bg-mint/10 text-mint" : netMinor < 0 ? "bg-coral/10 text-coral" : "bg-ink/5 text-ink/70";
                  const label = netMinor > 0 ? "to receive" : netMinor < 0 ? "to pay" : "settled";

                  return (
                    <div key={participant.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${ledgerClass}`}>
                      <span>{participant.name}</span>
                      <span>{label === "settled" ? label : `${label} ${formatCurrency(Math.abs(netMinor))}`}</span>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="rounded-2xl bg-white/85 p-4 shadow-card">
              <h2 className="font-display text-xl">Contribution chart</h2>
              <div className="mt-3 space-y-2">
                {contributionData.map((row) => {
                  const max = Math.max(...contributionData.map((r) => r.totalMinor), 1);
                  const width = (row.totalMinor / max) * 100;
                  return (
                    <div key={row.name}>
                      <div className="flex justify-between text-sm">
                        <span>{row.name}</span>
                        <span>{formatCurrency(row.totalMinor)}</span>
                      </div>
                      <div className="mt-1 h-3 rounded-full bg-ink/10">
                        <div className="h-3 rounded-full bg-mint" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>
        </section>
      </div>
    </main>
  );
}
