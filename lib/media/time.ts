export function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const milliseconds = Math.round(value * 1000);
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const fraction =
    (milliseconds % 1000).toString().padStart(3, "0").replace(/0+$/, "") || "0";

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${fraction}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${fraction}`;
}

export function parseTime(value: string) {
  const parts = value.trim().split(":");
  if (
    parts.some(
      (part) => !/^\d+(?:\.\d+)?$/.test(part) || !Number.isFinite(Number(part)),
    )
  ) {
    return null;
  }

  if (parts.length === 1) return Number(parts[0]);
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  }
  return null;
}
