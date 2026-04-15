type ParticipantCore = {
  id: string;
  name: string;
  isOwnerParticipant: boolean;
};

type ExpenseCore = {
  payerParticipantId: string;
  shares: Array<{ participantId: string; amountMinor: number }>;
};

export type BalanceMatrixResult = {
  matrixEntries: Array<{ fromParticipantId: string; toParticipantId: string; amountMinor: number }>;
  netByParticipant: Record<string, number>;
};

export function deriveBalances(participants: ParticipantCore[], expenses: ExpenseCore[]): BalanceMatrixResult {
  const obligationMap = new Map<string, number>();

  const keyFor = (from: string, to: string): string => `${from}->${to}`;

  for (const expense of expenses) {
    for (const share of expense.shares) {
      if (share.participantId === expense.payerParticipantId) {
        continue;
      }

      const forwardKey = keyFor(share.participantId, expense.payerParticipantId);
      const reverseKey = keyFor(expense.payerParticipantId, share.participantId);
      const reverseAmount = obligationMap.get(reverseKey) ?? 0;

      if (reverseAmount > 0) {
        if (reverseAmount >= share.amountMinor) {
          obligationMap.set(reverseKey, reverseAmount - share.amountMinor);
        } else {
          obligationMap.delete(reverseKey);
          obligationMap.set(forwardKey, share.amountMinor - reverseAmount);
        }
      } else {
        obligationMap.set(forwardKey, (obligationMap.get(forwardKey) ?? 0) + share.amountMinor);
      }
    }
  }

  const matrixEntries = Array.from(obligationMap.entries())
    .filter(([, amount]) => amount > 0)
    .map(([key, amount]) => {
      const [fromParticipantId, toParticipantId] = key.split("->");
      return { fromParticipantId, toParticipantId, amountMinor: amount };
    });

  const netByParticipant = Object.fromEntries(participants.map((p) => [p.id, 0]));

  for (const entry of matrixEntries) {
    netByParticipant[entry.fromParticipantId] -= entry.amountMinor;
    netByParticipant[entry.toParticipantId] += entry.amountMinor;
  }

  return { matrixEntries, netByParticipant };
}

export function deriveSettlements(netByParticipant: Record<string, number>): Array<{
  fromParticipantId: string;
  toParticipantId: string;
  amountMinor: number;
}> {
  const debtors = Object.entries(netByParticipant)
    .filter(([, amount]) => amount < 0)
    .map(([participantId, amount]) => ({ participantId, amountMinor: -amount }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const creditors = Object.entries(netByParticipant)
    .filter(([, amount]) => amount > 0)
    .map(([participantId, amount]) => ({ participantId, amountMinor: amount }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const settlements: Array<{ fromParticipantId: string; toParticipantId: string; amountMinor: number }> = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amountMinor, creditor.amountMinor);

    if (amount > 0) {
      settlements.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        amountMinor: amount
      });
    }

    debtor.amountMinor -= amount;
    creditor.amountMinor -= amount;

    if (debtor.amountMinor === 0) i += 1;
    if (creditor.amountMinor === 0) j += 1;
  }

  return settlements;
}

export function ownerSummary(ownerParticipantId: string, matrixEntries: Array<{ fromParticipantId: string; toParticipantId: string; amountMinor: number }>): {
  ownerOwedMinor: number;
  ownerOwesMinor: number;
} {
  let ownerOwedMinor = 0;
  let ownerOwesMinor = 0;

  for (const entry of matrixEntries) {
    if (entry.toParticipantId === ownerParticipantId) {
      ownerOwedMinor += entry.amountMinor;
    }
    if (entry.fromParticipantId === ownerParticipantId) {
      ownerOwesMinor += entry.amountMinor;
    }
  }

  return { ownerOwedMinor, ownerOwesMinor };
}
