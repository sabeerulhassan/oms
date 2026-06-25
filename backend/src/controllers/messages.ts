import { Request, Response } from "express";
import { query } from "../config/database";

// GET /messages
export const getMessages = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string; // 'pending' or 'sent'
    const type = req.query.type as string;     // e.g., 'loyalty_initial', 'referral_optin'
    
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let queryParams: any[] = [];

    // Filter by Status (Pending = sent_at IS NULL, Sent = sent_at IS NOT NULL)
    if (status === "pending") {
      whereClauses.push("sent_at IS NULL");
      // Only fetch messages where the scheduled send time has arrived
      whereClauses.push("(send_by <= now() OR send_by IS NULL)");
    } else if (status === "sent") {
      whereClauses.push("sent_at IS NOT NULL");
    }

    // Filter by Message Type
    if (type) {
      queryParams.push(type);
      whereClauses.push(`type = $${queryParams.length}`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Determine Sort Order based on status
    // Pending: Urgency (Oldest send_by first)
    // Sent: Recency (Newest sent_at first)
    let orderString = "ORDER BY created_at DESC"; // Default
    if (status === "pending") {
      orderString = "ORDER BY send_by ASC NULLS LAST";
    } else if (status === "sent") {
      orderString = "ORDER BY sent_at DESC";
    }

    const dataQuery = `SELECT * FROM message_queue ${whereString} ${orderString} LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    const countQuery = `SELECT count(*) FROM message_queue ${whereString}`;

    const [dataResult, countResult] = await Promise.all([
      query(dataQuery, [...queryParams, limit, offset]),
      query(countQuery, queryParams),
    ]);

    // Compute 'is_overdue' boolean dynamically for pending messages
    const now = new Date();
    const formattedData = dataResult.rows.map((msg) => {
      let is_overdue = false;
      if (!msg.sent_at && msg.send_by) {
        // If send_by date is strictly before the current date/time
        is_overdue = new Date(msg.send_by) < now;
      }
      return { ...msg, is_overdue };
    });

    return res.status(200).json({
      data: formattedData,
      meta: {
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Failed to query message database:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// PATCH /messages/:id/sent
export const markAsSent = async (req: Request, res: Response) => {
  try {
    const messageId = req.params.id;

    // We include "sent_at IS NULL" to prevent overwriting the original sent timestamp
    // if the admin accidentally clicks "Mark Sent" twice rapidly.
    const result = await query(
      `UPDATE message_queue 
       SET sent_at = now() 
       WHERE id = $1 AND sent_at IS NULL 
       RETURNING *`,
      [messageId]
    );

    if (result.rows.length === 0) {
      // Check if it exists but was already sent
      const checkRes = await query(`SELECT sent_at FROM message_queue WHERE id = $1`, [messageId]);
      if (checkRes.rows.length > 0 && checkRes.rows[0].sent_at !== null) {
        return res.status(400).json({ message: "Message has already been marked as sent." });
      }
      return res.status(404).json({ message: "Message not found." });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to mark message as sent:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};