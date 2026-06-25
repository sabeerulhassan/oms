/**
 * Formats a date string or Date object to the Asia/Colombo timezone representation.
 * Standard format: YYYY-MM-DD HH:MM:SS
 */
export function formatToColomboTime(
  dateInput: string | Date | null | undefined,
  includeTime: boolean = true
): string {
  if (!dateInput) return "—";
  
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  
  if (isNaN(date.getTime())) return "Invalid Date";

  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime && {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  };

  const formattedParts = new Intl.DateTimeFormat("en-CA", options).format(date);
  return formattedParts.replace(",", "");
}