import * as fs from "fs";
import * as path from "path";

/**
 * Returns the deployment JSON filename for the given network.
 * Looks for deployment_testnet_<network>.json first, then falls back
 * to deployment_testnet.json for backward compatibility.
 */
export function getDeploymentFile(networkName: string): string {
  const root = path.join(__dirname, "../../");
  const specific = `deployment_testnet_${networkName}.json`;
  if (fs.existsSync(path.join(root, specific))) return specific;
  // backward compat fallback
  if (fs.existsSync(path.join(root, "deployment_testnet.json"))) return "deployment_testnet.json";
  return "deployment.json";
}
