import { HttpError } from "../utils/httpError.js";

type SplitMode = "equal" | "custom" | "percentage";

type CustomShareInput = {
  participantId: string;
  amountMinor: number;
};

type PercentageShareInput = {
  participantId: string;
  percentageBasisPoints: number;
};

export type ComputedShare = {
  participantId: string;
  amountMinor: number;
  percentageBasisPoints: number | null;
};

type ComputeInput = {
  splitMode: SplitMode;
  amountMinor: number;
  payerParticipantId: string;
  participantIds: string[];
  customShares?: CustomShareInput[];
  percentageShares?: PercentageShareInput[];
};

function ensureUnique(ids: string[], label: string): void {
  const uniqueCount = new Set(ids).size;
  if (uniqueCount !== ids.length) {
    throw new HttpError(400, `${label} contains duplicate participants`);
  }
}

function ensurePayerIncluded(participantIds: string[], payerParticipantId: string): void {
  if (!participantIds.includes(payerParticipantId)) {
    throw new HttpError(400, "Payer must be included in split participants");
  }
}

function computeEqualShares(input: ComputeInput): ComputedShare[] {
  const count = input.participantIds.length;
  const base = Math.floor(input.amountMinor / count);
  const remainder = input.amountMinor - base * count;

  return input.participantIds.map((participantId) => {
    const remainderForPayer = participantId === input.payerParticipantId ? remainder : 0;
    return {
      participantId,
      amountMinor: base + remainderForPayer,
      percentageBasisPoints: null
    };
  });
}

function computeCustomShares(input: ComputeInput): ComputedShare[] {
  if (!input.customShares || input.customShares.length === 0) {
    throw new HttpError(400, "Custom split requires customShares");
  }

  ensureUnique(input.customShares.map((s) => s.participantId), "customShares");

  const sum = input.customShares.reduce((acc, item) => acc + item.amountMinor, 0);
  if (sum !== input.amountMinor) {
    throw new HttpError(400, "Custom shares must sum exactly to expense amount");
  }

  const validParticipants = new Set(input.participantIds);
  for (const share of input.customShares) {
    if (!validParticipants.has(share.participantId)) {
      throw new HttpError(400, "Custom shares include participant outside selected split participants");
    }
  }

  return input.customShares.map((s) => ({
    participantId: s.participantId,
    amountMinor: s.amountMinor,
    percentageBasisPoints: null
  }));
}

function computePercentageShares(input: ComputeInput): ComputedShare[] {
  if (!input.percentageShares || input.percentageShares.length === 0) {
    throw new HttpError(400, "Percentage split requires percentageShares");
  }

  ensureUnique(input.percentageShares.map((s) => s.participantId), "percentageShares");

  const validParticipants = new Set(input.participantIds);
  for (const share of input.percentageShares) {
    if (!validParticipants.has(share.participantId)) {
      throw new HttpError(400, "Percentage shares include participant outside selected split participants");
    }
  }

  const sumBasisPoints = input.percentageShares.reduce((acc, item) => acc + item.percentageBasisPoints, 0);
  if (sumBasisPoints !== 10000) {
    throw new HttpError(400, "Percentage shares must sum exactly to 10000 basis points");
  }

  let allocated = 0;
  const computed = input.percentageShares.map((share) => {
    const raw = Math.floor((input.amountMinor * share.percentageBasisPoints) / 10000);
    allocated += raw;
    return {
      participantId: share.participantId,
      amountMinor: raw,
      percentageBasisPoints: share.percentageBasisPoints
    };
  });

  const remainder = input.amountMinor - allocated;
  if (remainder > 0) {
    const payerShare = computed.find((share) => share.participantId === input.payerParticipantId);
    if (!payerShare) {
      throw new HttpError(400, "Payer must be present in percentage shares to absorb rounding remainder");
    }
    payerShare.amountMinor += remainder;
  }

  const finalSum = computed.reduce((acc, share) => acc + share.amountMinor, 0);
  if (finalSum !== input.amountMinor) {
    throw new HttpError(400, "Computed percentage shares do not match total amount");
  }

  return computed;
}

export function computeExpenseShares(input: ComputeInput): ComputedShare[] {
  if (input.amountMinor <= 0) {
    throw new HttpError(400, "Amount must be positive");
  }
  if (!input.participantIds.length) {
    throw new HttpError(400, "At least one split participant is required");
  }

  ensureUnique(input.participantIds, "participantIds");
  ensurePayerIncluded(input.participantIds, input.payerParticipantId);

  switch (input.splitMode) {
    case "equal":
      return computeEqualShares(input);
    case "custom":
      return computeCustomShares(input);
    case "percentage":
      return computePercentageShares(input);
    default:
      throw new HttpError(400, "Unsupported split mode");
  }
}
