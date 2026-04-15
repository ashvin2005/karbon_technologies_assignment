import type { Expense, GroupSummary, Participant, SettlementRecommendation } from "@splitmint/shared";

function normalizeApiUrl(url?: string): string {
  const trimmed = url?.trim();
  if (!trimmed) return "http://localhost:5001/api";

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/api") ? withoutTrailingSlash : `${withoutTrailingSlash}/api`;
}

const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      }
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Cannot reach backend API. Ensure the server is running and VITE_API_URL is correct.");
    }
    throw error;
  }

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      message = response.statusText;
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  register(email: string, password: string) {
    return request<{ user: { id: string; email: string; createdAt: string } }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  login(email: string, password: string) {
    return request<{ user: { id: string; email: string; createdAt: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  me() {
    return request<{ user: { id: string; email: string; createdAt: string } }>("/auth/me");
  },
  logout() {
    return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  },
  listGroups() {
    return request<{ groups: GroupSummary[] }>("/groups");
  },
  createGroup(name: string) {
    return request<{ group: GroupSummary & { participants: Participant[] } }>("/groups", {
      method: "POST",
      body: JSON.stringify({ name })
    });
  },
  updateGroup(groupId: string, name: string) {
    return request<{ group: GroupSummary }>(`/groups/${groupId}`, {
      method: "PUT",
      body: JSON.stringify({ name })
    });
  },
  deleteGroup(groupId: string) {
    return request<{ ok: boolean }>(`/groups/${groupId}`, {
      method: "DELETE"
    });
  },
  getGroup(groupId: string) {
    return request<{ group: GroupSummary & { participants: Participant[] } }>(`/groups/${groupId}`);
  },
  addParticipant(groupId: string, payload: { name: string; avatarColor: string }) {
    return request<{ participant: Participant }>(`/groups/${groupId}/participants`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  updateParticipant(groupId: string, participantId: string, payload: { name?: string; avatarColor?: string }) {
    return request<{ participant: Participant }>(`/groups/${groupId}/participants/${participantId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  removeParticipant(groupId: string, participantId: string) {
    return request<{ ok: boolean; removedExpenseCount?: number }>(`/groups/${groupId}/participants/${participantId}`, { method: "DELETE" });
  },
  listExpenses(groupId: string, query: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return request<{ expenses: Expense[]; metadata: { appliedFilters: Record<string, unknown>; count: number } }>(
      `/groups/${groupId}/expenses?${params.toString()}`
    );
  },
  createExpense(groupId: string, payload: Record<string, unknown>) {
    return request<{ expense: Expense }>(`/groups/${groupId}/expenses`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  updateExpense(groupId: string, expenseId: string, payload: Record<string, unknown>) {
    return request<{ expense: Expense }>(`/groups/${groupId}/expenses/${expenseId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  deleteExpense(groupId: string, expenseId: string) {
    return request<{ ok: boolean }>(`/groups/${groupId}/expenses/${expenseId}`, {
      method: "DELETE"
    });
  },
  balances(groupId: string) {
    return request<{
      participants: Participant[];
      matrixEntries: Array<{ fromParticipantId: string; toParticipantId: string; amountMinor: number }>;
      netByParticipant: Record<string, number>;
      ownerSummary: { ownerOwedMinor: number; ownerOwesMinor: number } | null;
    }>(`/groups/${groupId}/balances`);
  },
  settlements(groupId: string) {
    return request<{ recommendations: SettlementRecommendation[] }>(`/groups/${groupId}/settlements`);
  },
  parseExpense(text: string, groupId: string) {
    return request<{ parsed: Record<string, unknown> }>("/ai/parse-expense", {
      method: "POST",
      body: JSON.stringify({ text, groupId })
    });
  },
  groupSummary(groupId: string) {
    return request<{
      summary: {
        summary?: string;
        topCategory?: string;
        aiSettlementSuggestions?: Array<{
          fromParticipantId: string;
          toParticipantId: string;
          amountMinor: number;
          reason?: string;
        }>;
      };
      participantMap: Record<string, string>;
    }>("/ai/group-summary", {
      method: "POST",
      body: JSON.stringify({ groupId })
    });
  }
};

export function formatCurrency(amountMinor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(amountMinor / 100);
}
