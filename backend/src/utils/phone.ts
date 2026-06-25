/**
 * Normalizes a phone number to standard Sri Lankan format: 07XXXXXXXX
 * Strips spaces, dashes, and replaces +94 / 94 country codes.
 */
export function normalizePhone(rawPhone: string): string {
    if (!rawPhone) throw new Error("Phone number is required");
  
    // Remove spaces, dashes, and parentheses
    let cleaned = rawPhone.replace(/[\s\-\(\)]/g, "");
  
    // Replace +94 or 94 country codes with 0
    if (cleaned.startsWith("+94")) {
      cleaned = "0" + cleaned.substring(3);
    } else if (cleaned.startsWith("94") && cleaned.length === 11) {
      cleaned = "0" + cleaned.substring(2);
    }
  
    // Validate format: Exactly 10 digits starting with 07
    const phoneRegex = /^07\d{8}$/;
    if (!phoneRegex.test(cleaned)) {
      throw new Error("Invalid phone number format. Must be 10 digits starting with 07.");
    }
  
    return cleaned;
  }