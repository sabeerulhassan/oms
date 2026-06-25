import { PoolClient } from "pg";
import { generateLoyaltyCode } from "../utils/codeGenerator";

const DISCOUNT_TIERS = [
  { minOrder: 3500, discountAmount: 400, expiryDays: 90 },
  { minOrder: 2000, discountAmount: 250, expiryDays: 60 },
  { minOrder: 1000, discountAmount: 150, expiryDays: 45 },
  { minOrder: 0,    discountAmount: 75,  expiryDays: 30 },
];

export async function runDeliveryTrigger(client: PoolClient, orderId: string): Promise<void> {
  // 1. Fetch Order and Customer Data
  const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (orderRes.rows.length === 0) throw new Error("Order not found for delivery trigger");
  const order = orderRes.rows[0];

  const customerRes = await client.query(`SELECT name FROM customers WHERE phone = $1`, [order.customer_phone]);
  const customerName = customerRes.rows[0].name;

  // 2. Calculate Loyalty Tier for current order
  const tier = DISCOUNT_TIERS.find((t) => order.total_amount >= t.minOrder) || DISCOUNT_TIERS[3];

  // 3. Generate and Insert Loyalty Code
  let newCode = "";
  for (let i = 0; i < 5; i++) {
    newCode = generateLoyaltyCode();
    const exists = await client.query(`SELECT 1 FROM loyalty_codes WHERE code = $1`, [newCode]);
    if (exists.rows.length === 0) break;
  }
  if (!newCode) throw new Error("Failed to generate a unique loyalty code");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + tier.expiryDays);

  await client.query(
    `INSERT INTO loyalty_codes (order_id, customer_phone, code, discount_amount, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [orderId, order.customer_phone, newCode, tier.discountAmount, expiresAt]
  );

  // 4. Queue Loyalty Initial Message
  const expiryStr = expiresAt.toISOString().split("T")[0];
  const initialMsg = `Hi ${customerName}! Thank you for your order. Here is your Rs ${tier.discountAmount} loyalty discount code: ${newCode}. Valid until: ${expiryStr}.`;
  
  await client.query(
    `INSERT INTO message_queue (to_phone, to_name, message_text, type, reference_id, send_by)
     VALUES ($1, $2, $3, 'loyalty_initial', $4, now())`,
    [order.customer_phone, customerName, initialMsg, orderId]
  );

  // 5. Queue Loyalty Reminder Message
  const reminderDate = new Date(expiresAt);
  reminderDate.setDate(reminderDate.getDate() - 3);
  const reminderMsg = `Hi ${customerName}! Just a reminder that your Rs ${tier.discountAmount} discount code (${newCode}) expires in 3 days!`;
  
  await client.query(
    `INSERT INTO message_queue (to_phone, to_name, message_text, type, reference_id, send_by)
     VALUES ($1, $2, $3, 'loyalty_reminder', $4, $5)`,
    [order.customer_phone, customerName, reminderMsg, orderId, reminderDate]
  );

  // 6. Complete Pending Referral & Notify Referrer
  const referralCheck = await client.query(
    `UPDATE referrals 
     SET status = 'completed', completed_at = now(), completed_order_id = $1 
     WHERE referee_phone = $2 AND status = 'pending' 
     RETURNING referrer_phone`,
    [orderId, order.customer_phone]
  );

  if (referralCheck.rows.length > 0) {
    const referrerPhone = referralCheck.rows[0].referrer_phone;
    
    // Fetch Referrer details to build personalized message
    const referrerRes = await client.query(`SELECT name FROM customers WHERE phone = $1`, [referrerPhone]);
    if (referrerRes.rows.length > 0) {
      const referrerName = referrerRes.rows[0].name;
      
      const notifyMsg = `Hi ${referrerName}! Your friend ${customerName} just completed their first order! We have credited Rs 150 to your account. This discount will apply automatically on your next order!`;
      
      await client.query(
        `INSERT INTO message_queue (to_phone, to_name, message_text, type, send_by)
         VALUES ($1, $2, $3, 'loyalty_initial', now())`,
        [referrerPhone, referrerName, notifyMsg]
      );
    }
  }

  // 7. Update Order Delivered Timestamp
  await client.query(`UPDATE orders SET delivered_at = now() WHERE id = $1`, [orderId]);
}