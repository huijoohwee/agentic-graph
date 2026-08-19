export function createMockStraitsXClient() {
  const calls = [];
  return {
    calls,
    issueCard(payload) {
      calls.push({ service: "straitsx", operation: "issueCard", payload });
      return { ok: true, cardId: `mock-card-${calls.length}` };
    },
  };
}

export function createMockAvalancheClient() {
  const calls = [];
  return {
    calls,
    verifySettlement(payload) {
      calls.push({ service: "avalanche", operation: "verifySettlement", payload });
      return { ok: true, txId: `mock-tx-${calls.length}` };
    },
  };
}
