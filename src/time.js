const SRT_TIME = /^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/;
const ASS_TIME = /^(\d{1,2}):(\d{2}):(\d{2})[.](\d{2})$/;

export function parseTimestamp(value, kind = "srt") {
  const text = String(value ?? "").trim();
  const match = (kind === "ass" ? ASS_TIME : SRT_TIME).exec(text);
  if (!match) return null;
  const [, hours, minutes, seconds, fraction] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;
  const multiplier = kind === "ass" ? 10 : 1;
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000 +
    Number(fraction) * multiplier
  );
}

export function secondsToMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1_000) : null;
}

export function formatTimestamp(ms) {
  if (!Number.isFinite(ms)) return "?:??:??.???";
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":") + `.${String(millis).padStart(3, "0")}`;
}
