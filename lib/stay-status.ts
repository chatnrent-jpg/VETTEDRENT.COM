export type DisplayStayStatus = "active" | "warning" | "terminated";

export function displayStayStatus(value: unknown): DisplayStayStatus | null {
  if (value === "active") {
    return "active";
  }
  if (value === "warning" || value === "warning_1" || value === "warning_2") {
    return "warning";
  }
  if (value === "terminated") {
    return "terminated";
  }
  return null;
}
