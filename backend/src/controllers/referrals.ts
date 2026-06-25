import { Request, Response } from "express";
import { query } from "../config/database";
import { normalizePhone } from "../utils/phone";

// POST /referrals/optin
export const sendOptIn = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number is required" });

    const normalizedPhone = normalizePhone(phone);

    // 1. Fetch customer
    const customerRes = await query(`SELECT name, opted_in FROM customers WHERE phone = $1`, [normalizedPhone]);
    if (customerRes.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const customer = customerRes.rows[0];

    // 2. Check if already opted in
    if (customer.opted_in) {
      return res.status(400).json({ error: "Customer is already opted into the referral programme" });
    }

    // 3. Ensure they have at least one delivered order
    const ordersRes = await query(
      `SELECT 1 FROM orders WHERE customer_phone = $1 AND status = 'delivered' LIMIT 1`,
      [normalizedPhone]
    );
    if (ordersRes.rows.length === 0) {
      return res.status(400).json({ error: "Customer must have at least one delivered order to be invited" });
    }

    // 4. Queue the referral_optin message
    const msgText = `Hi ${customer.name}! Would you like to earn Rs 150 off your next order by referring a friend to Kurkees? Reply YES to get your shareable link!`;
    
    await query(
      `INSERT INTO message_queue (to_phone, to_name, message_text, type, send_by)
       VALUES ($1, $2, $3, 'referral_optin', now())`,
      [normalizedPhone, customer.name, msgText]
    );

    return res.status(200).json({ message: "Opt-in message queued successfully." });
  } catch (error: any) {
    if (error.message.includes("Invalid phone number format")) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// POST /referrals/confirm-optin
export const confirmOptIn = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number is required" });

    const normalizedPhone = normalizePhone(phone);

    // 1. Fetch customer
    const customerRes = await query(`SELECT name FROM customers WHERE phone = $1`, [normalizedPhone]);
    if (customerRes.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const customer = customerRes.rows[0];

    // 2. Set customer as opted in
    await query(`UPDATE customers SET opted_in = TRUE WHERE phone = $1`, [normalizedPhone]);

    // 3. Queue the referral_share message containing the template
    const shareTemplate = `Hey! I just ordered some amazing peanut butter from Kurkees. If you want to try them, just send my phone number (${normalizedPhone}) when you place your order, and we both get a discount!`;
    const msgText = `Awesome ${customer.name}! You are opted in. Just forward the message below to your friends:\n\n"${shareTemplate}"`;

    await query(
      `INSERT INTO message_queue (to_phone, to_name, message_text, type, send_by)
       VALUES ($1, $2, $3, 'referral_share', now())`,
      [normalizedPhone, customer.name, msgText]
    );

    return res.status(200).json({ message: "Customer opted in and share message queued." });
  } catch (error: any) {
    if (error.message.includes("Invalid phone number format")) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// PATCH /referrals/:id
export const updateReferralStatus = async (req: Request, res: Response) => {
  try {
    const referralId = req.params.id;
    const { status } = req.body;

    // Admin should only be able to manually invalidate a referral.
    // 'pending' -> 'completed' happens automatically via the Delivery Trigger.
    if (status !== "invalid") {
      return res.status(400).json({ error: "Manual updates are restricted to 'invalid' status only." });
    }

    const result = await query(
      `UPDATE referrals SET status = $1 WHERE id = $2 RETURNING *`,
      [status, referralId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Referral record not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};