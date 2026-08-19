export const DEV_LANE = "Dev_Lane";
export const DEPLOY_BOUNDARY_REGISTER = Object.freeze([
  { boundary: "Dev_Lane", state: "closed" },
  { boundary: "Prod_Mirror", state: "closed" },
  { boundary: "Cloudflare_Routes", state: "closed" },
]);

export function evaluateDeployOperation(operation) {
  if (operation?.capability === "environment mutate") {
    return reject(operation, "environment-mutate-forbidden");
  }
  if (operation?.targetBoundary && operation.targetBoundary !== DEV_LANE) {
    return reject(operation, "boundary-crossing-forbidden");
  }
  return { ok: true, state: "closed", boundaryRegister: DEPLOY_BOUNDARY_REGISTER };
}

export function boundaryReport() {
  return { lane: DEV_LANE, boundaryRegister: DEPLOY_BOUNDARY_REGISTER };
}

function reject(operation, reason) {
  return { ok: false, reason, requestedOperation: operation, boundaryRegister: DEPLOY_BOUNDARY_REGISTER };
}
