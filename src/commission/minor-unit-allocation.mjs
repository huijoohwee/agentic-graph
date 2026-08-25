export function allocateMinorUnits({ totalMinor, weights }) {
  if (!isPositiveSafeInteger(totalMinor)) {
    return { ok: false, reason: "invalid-total-minor" };
  }
  if (!Array.isArray(weights) || weights.length === 0 || !weights.every(validWeight)) {
    return { ok: false, reason: "invalid-allocation-weights" };
  }
  const identifiers = new Set(weights.map(({ id }) => id));
  if (identifiers.size !== weights.length) {
    return { ok: false, reason: "duplicate-allocation-identifier" };
  }

  const denominator = weights.reduce((sum, { weight }) => sum + BigInt(weight), 0n);
  const total = BigInt(totalMinor);
  const allocated = weights.map(({ id, weight }) => {
    const numerator = total * BigInt(weight);
    return { id, amountMinor: numerator / denominator, remainder: numerator % denominator };
  });
  let remaining = total - allocated.reduce((sum, item) => sum + item.amountMinor, 0n);
  const remainderOrder = [...allocated].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
  for (let index = 0; remaining > 0n; index += 1, remaining -= 1n) {
    remainderOrder[index].amountMinor += 1n;
  }
  const shares = allocated
    .map(({ id, amountMinor }) => ({ id, amountMinor: Number(amountMinor) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return { ok: true, shares };
}

function validWeight(candidate) {
  return candidate
    && typeof candidate.id === "string"
    && candidate.id.length > 0
    && isPositiveSafeInteger(candidate.weight);
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
