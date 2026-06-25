/**
 * Standardizes common address abbreviations, removes punctuation,
 * and filters out structural stop-words.
 */
export function cleanAddress(addr: string): string[] {
    if (!addr) return [];
    
    return addr
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ") // Replace punctuation with space
      .split(/\s+/)                                // Split on whitespace
      .map((word) => {
        // Standardize abbreviations
        if (word === "rd") return "road";
        if (word === "st") return "street";
        if (word === "ave") return "avenue";
        if (word === "no" || word === "num" || word === "number") return "";
        return word;
      })
      // Filter out short terms, empty strings, and common location stop-words
      .filter(
        (word) =>
          word.length > 1 &&
          !["road", "street", "avenue", "colombo", "srilanka", "lk", "lanes", "lane"].includes(word)
      );
  }
  
  /**
   * Calculates the Jaccard Similarity Coefficient (value between 0 and 1)
   * representing the overlap of unique keyword tokens between two addresses.
   */
  export function calculateAddressSimilarity(addr1: string, addr2: string): number {
    const tokens1 = new Set(cleanAddress(addr1));
    const tokens2 = new Set(cleanAddress(addr2));
  
    if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
  
    return intersection.size / union.size; // Intersection over Union
  }