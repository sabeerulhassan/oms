import { Request, Response } from "express";
import { query } from "../config/database";

// POST /tracking/upload
export const uploadTrackingNumbers = async (req: Request, res: Response) => {
  try {
    const { tracking_numbers } = req.body;

    if (!Array.isArray(tracking_numbers) || tracking_numbers.length === 0) {
      return res.status(400).json({ message: "An array of tracking numbers is required." });
    }

    // 1. Clean the input list (remove whitespace, empty values, and local duplicates)
    const cleanInput = Array.from(
      new Set(
        tracking_numbers
          .map(t => String(t).trim())
          .filter(Boolean)
      )
    );

    if (cleanInput.length === 0) {
      return res.status(400).json({ message: "No valid tracking numbers provided." });
    }

    // 2. Check if any tracking numbers are already assigned in the "orders" table
    const usedInOrdersRes = await query(
      `SELECT DISTINCT tracking_number FROM orders WHERE tracking_number = ANY($1)`,
      [cleanInput]
    );
    const usedInOrders = usedInOrdersRes.rows.map(r => r.tracking_number);

    // 3. Check if any tracking numbers are already marked as used in the "tracking_pool"
    const usedInPoolRes = await query(
      `SELECT tracking_number FROM tracking_pool WHERE tracking_number = ANY($1) AND used_on_order_id IS NOT NULL`,
      [cleanInput]
    );
    const usedInPool = usedInPoolRes.rows.map(r => r.tracking_number);

    // 4. Combine all unique, already-used tracking numbers found in the database
    const allUsedNumbers = Array.from(new Set([...usedInOrders, ...usedInPool]));

    // 5. Filter out the used tracking numbers, leaving only fresh ones
    const insertableNumbers = cleanInput.filter(num => !allUsedNumbers.includes(num));

    if (insertableNumbers.length === 0) {
      return res.status(400).json({ 
        message: "Upload failed. All provided tracking numbers have already been used on previous orders.",
        skipped_used_list: allUsedNumbers
      });
    }

    // 6. Insert only the strictly fresh tracking numbers
    const result = await query(
      `INSERT INTO tracking_pool (tracking_number) 
       SELECT * FROM UNNEST($1::text[]) 
       ON CONFLICT (tracking_number) DO NOTHING`,
      [insertableNumbers]
    );

    // 7. Inform the admin about newly added numbers vs skipped used numbers
    return res.status(200).json({ 
      message: "Tracking numbers processed successfully.",
      added_count: result.rowCount,
      skipped_used_count: allUsedNumbers.length,
      skipped_used_list: allUsedNumbers
    });
  } catch (error) {
    console.error("Tracking upload error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /tracking/stats
export const getTrackingStats = async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT count(*) FROM tracking_pool WHERE used_on_order_id IS NULL`
    );
    return res.status(200).json({ available: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error("Tracking stats error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};