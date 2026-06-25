import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool, query } from "../config/database";
import { normalizePhone } from "../utils/phone";
import { generateLoyaltyCode, generateOrderNumber } from "../utils/codeGenerator";
import { runDeliveryTrigger } from "../services/deliveryTrigger";
import { calculateAddressSimilarity } from "../utils/addressSimilarity";

const FLAT_DELIVERY_FEE = 200;

// POST /orders
export const createOrder = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { notes, discount_code, apply_first_time, kilo, gram, pcs, status, cart } = req.body;
    const customer_phone = normalizePhone(req.body.customer_phone);
    const client_submitted_total = Number(req.body.total_amount);

    let discount_amount = 0;
    let final_discount_code = null;
    let isReferral = false;
    let referrerPhone = "";

    const insertKilo = kilo !== undefined ? Number(kilo) : 0;
    const insertGram = gram !== undefined ? Number(gram) : 500;
    const insertPcs = pcs !== undefined ? Number(pcs) : 1;

    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const secret = process.env.JWT_SECRET || "dev-fallback-secret";
        const decoded = jwt.verify(token, secret) as any;
        if (decoded && decoded.role === "admin") {
          isAdmin = true;
        }
      } catch (err) {}
    }

    // --- SECURE DYNAMIC SERVER-SIDE MATH ENGINE ---
    let secure_subtotal = 0;
    let secure_summary = "";

    if (isAdmin) {
      secure_subtotal = client_submitted_total; 
      secure_summary = req.body.summary;
    } else {
      if (!cart || !Array.isArray(cart) || cart.length === 0) {
        throw new Error("Invalid cart payload.");
      }
      
      let cartTotal = 0;
      let summaryArr: string[] = [];
      
      // Fetch dynamic prices directly from the SQL database for verification
      for (const item of cart) {
        const dbSizeRes = await client.query(
          `SELECT ps.price, ps.in_stock 
           FROM product_sizes ps
           INNER JOIN products p ON ps.product_id = p.id
           WHERE p.slug = $1 AND ps.size = $2`,
          [item.slug, item.size]
        );

        const sizeRecord = dbSizeRes.rows[0];
        if (!sizeRecord) {
          throw new Error(`Security Exception: Product size does not exist (${item.slug} - ${item.size})`);
        }
        if (!sizeRecord.in_stock) {
          throw new Error(`Item ${item.name} (${item.size}) is temporarily out of stock.`);
        }

        cartTotal += sizeRecord.price * item.quantity;
        summaryArr.push(`${item.quantity}x ${item.name} (${item.size})`);
      }
      secure_subtotal = cartTotal;
      secure_summary = summaryArr.join(', ');
    }

    const insertStatus = (isAdmin && status) ? status : "pending";

    // 1. Verify selected customer exists OR automatically register them
    let customerCheck = await client.query(
      `SELECT name, address, city FROM customers WHERE phone = $1`,
      [customer_phone]
    );

    const isNewCustomerForDiscount = customerCheck.rows.length === 0;

    if (isNewCustomerForDiscount) {
      const { customer_name, customer_address, customer_city } = req.body;
      if (!customer_name) {
        throw new Error("Customer name is required for registration.");
      }
      await client.query(
        `INSERT INTO customers (phone, name, address, city) VALUES ($1, $2, $3, $4)`,
        [customer_phone, customer_name, customer_address || null, customer_city || null]
      );
      customerCheck = await client.query(
        `SELECT name, address, city FROM customers WHERE phone = $1`,
        [customer_phone]
      );
    }
    const placingCustomer = customerCheck.rows[0];

    // 2. Generate Order Number
    let order_number = "";
    for (let i = 0; i < 5; i++) {
      order_number = generateOrderNumber();
      const exists = await client.query(`SELECT 1 FROM orders WHERE order_number = $1`, [order_number]);
      if (exists.rows.length === 0) break;
    }
    if (!order_number) throw new Error("Failed to generate a unique order number");

    // 3. Referral Credits (Rs 150)
    const unusedReferralRes = await client.query(
      `SELECT id FROM referrals 
       WHERE referrer_phone = $1 
         AND status = 'completed' 
         AND referrer_reward_used_at IS NULL 
       ORDER BY created_at ASC 
       LIMIT 1 FOR UPDATE`,
      [customer_phone]
    );

    const hasReferralCredit = unusedReferralRes.rows.length > 0;
    const referralCreditId = hasReferralCredit ? unusedReferralRes.rows[0].id : null;

    if (hasReferralCredit && referralCreditId) {
      discount_amount = 150;
      final_discount_code = "AUTO-REFERRAL-CREDIT";
    } 
    // 4. Check for First-Time Buyer 12% Auto-Discount
    else if (apply_first_time !== false && isNewCustomerForDiscount) {
      if (placingCustomer.address) {
        const existingAddressesRes = await client.query(
          `SELECT DISTINCT c.phone, c.name, c.address FROM customers c
           INNER JOIN orders o ON o.customer_phone = c.phone
           WHERE c.phone != $1 AND o.status = 'delivered' AND c.address IS NOT NULL`,
          [customer_phone]
        );

        let fraudDetected = false;
        for (const row of existingAddressesRes.rows) {
          const score = calculateAddressSimilarity(placingCustomer.address, row.address);
          if (score >= 0.6) {
            fraudDetected = true;
            break;
          }
        }

        if (!fraudDetected) {
          discount_amount = Math.round(secure_subtotal * 0.12);
          final_discount_code = "AUTO-FIRST-TIME-12";
        }
      }
    }

    // 5. Manual Discount Code
    if (discount_amount === 0 && discount_code) {
      if (discount_code.startsWith("KRK-")) {
        const codeRes = await client.query(
          `SELECT * FROM loyalty_codes WHERE code = $1 FOR UPDATE`,
          [discount_code]
        );
        const loyaltyRecord = codeRes.rows[0];

        if (!loyaltyRecord) throw new Error("Invalid discount code");
        if (loyaltyRecord.used_at) throw new Error("Code has already been used");
        if (new Date(loyaltyRecord.expires_at) < new Date()) throw new Error("Code is expired");
        if (loyaltyRecord.customer_phone !== customer_phone) throw new Error("Code does not belong to this customer");

        discount_amount = loyaltyRecord.discount_amount;
        final_discount_code = discount_code;
      } else {
        referrerPhone = normalizePhone(discount_code);
        if (referrerPhone === customer_phone) throw new Error("Cannot refer yourself");

        const referrerRes = await client.query(`SELECT name FROM customers WHERE phone = $1`, [referrerPhone]);
        if (referrerRes.rows.length === 0) throw new Error("Referrer phone is not a registered customer");

        const previousOrders = await client.query(
          `SELECT 1 FROM orders WHERE customer_phone = $1 AND status = 'delivered' LIMIT 1`,
          [customer_phone]
        );
        if (previousOrders.rows.length > 0) throw new Error("Referrals only apply to new customers' first delivered order");

        const existingReferral = await client.query(
          `SELECT 1 FROM referrals WHERE referrer_phone = $1 AND referee_phone = $2 LIMIT 1`,
          [referrerPhone, customer_phone]
        );
        if (existingReferral.rows.length > 0) throw new Error("Referral relationship already exists");

        isReferral = true;
        discount_amount = 75;
        final_discount_code = discount_code;
      }
    }

    // --- PRICE TAMPERING PREVENTION ---
    const secure_final_amount = isAdmin 
      ? client_submitted_total 
      : Math.max(0, secure_subtotal - discount_amount) + FLAT_DELIVERY_FEE;

    if (!isAdmin && client_submitted_total !== secure_final_amount) {
      throw new Error("Price mismatch detected. Your cart pricing may be outdated or manipulated. Please refresh the page.");
    }

    // 6. Create Order
    const orderRes = await client.query(
      `INSERT INTO orders 
        (customer_phone, summary, total_amount, discount_code, discount_amount, final_amount, notes, kilo, gram, pcs, order_number, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        customer_phone, 
        secure_summary, 
        (secure_subtotal + FLAT_DELIVERY_FEE), 
        final_discount_code, 
        discount_amount, 
        secure_final_amount, 
        notes || null, 
        insertKilo, 
        insertGram, 
        insertPcs, 
        order_number, 
        insertStatus
      ]
    );
    const newOrder = orderRes.rows[0];

    if (final_discount_code === "AUTO-REFERRAL-CREDIT" && referralCreditId) {
      await client.query(
        `UPDATE referrals 
         SET referrer_reward_used_at = now(), 
             referrer_reward_used_on_order_id = $1 
         WHERE id = $2`,
        [newOrder.id, referralCreditId]
      );
    } else if (final_discount_code && final_discount_code.startsWith("KRK-")) {
      await client.query(
        `UPDATE loyalty_codes SET used_at = now(), used_on_order_id = $1 WHERE code = $2`,
        [newOrder.id, final_discount_code]
      );
    } else if (isReferral) {
      await client.query(
        `INSERT INTO referrals (referrer_phone, referee_phone, status, referrer_discount, referee_discount)
         VALUES ($1, $2, 'pending', 150, 75)`,
        [referrerPhone, customer_phone]
      );
    }

    await client.query("COMMIT");
    return res.status(201).json(newOrder);
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(400).json({ message: error.message || "Failed to create order" });
  } finally {
    client.release();
  }
};

// GET /orders
export const getOrders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    const customer_phone = req.query.customer_phone as string;
    const search = req.query.search as string;
    
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let queryParams: any[] = [];

    if (status) {
      queryParams.push(status);
      whereClauses.push(`o.status = $${queryParams.length}`);
    }
    if (customer_phone) {
      queryParams.push(normalizePhone(customer_phone));
      whereClauses.push(`o.customer_phone = $${queryParams.length}`);
    }
    if (search) {
      queryParams.push(`%${search}%`);
      whereClauses.push(`(o.summary ILIKE $${queryParams.length} OR o.notes ILIKE $${queryParams.length} OR o.order_number ILIKE $${queryParams.length})`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
      SELECT o.*, c.name as customer_name, c.address as customer_address, c.city as customer_city 
      FROM orders o
      LEFT JOIN customers c ON o.customer_phone = c.phone
      ${whereString} 
      ORDER BY o.created_at DESC 
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    const countQuery = `
      SELECT count(*) 
      FROM orders o
      LEFT JOIN customers c ON o.customer_phone = c.phone
      ${whereString}
    `;

    const [dataResult, countResult] = await Promise.all([
      query(dataQuery, [...queryParams, limit, offset]),
      query(countQuery, queryParams),
    ]);

    return res.status(200).json({
      data: dataResult.rows,
      meta: { total: parseInt(countResult.rows[0].count), page, limit },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// PATCH /orders/:id
export const updateOrderStatus = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const orderId = req.params.id;
    const { status, tracking_number } = req.body;

    const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (orderRes.rows.length === 0) throw new Error("Order not found");
    const order = orderRes.rows[0];

    const nextStatus = status || order.status;
    const nextTracking = tracking_number !== undefined ? tracking_number : order.tracking_number;

    if (order.status === nextStatus && order.tracking_number === nextTracking) {
      await client.query("ROLLBACK");
      return res.status(200).json(order);
    }

    if (nextStatus === "dispatched" && !nextTracking) {
      throw new Error("Cannot dispatch order. A valid tracking number is required.");
    }

    if (nextStatus === "dispatched" && order.status !== "dispatched") {
      const custRes = await client.query(`SELECT name FROM customers WHERE phone = $1`, [order.customer_phone]);
      const customerName = custRes.rows[0]?.name || "Customer";

      const dispatchMsg = `Hi ${customerName}! Your Kurkees order ${order.order_number} has been dispatched. Tracking No: ${nextTracking}.`;

      await client.query(
        `INSERT INTO message_queue (to_phone, to_name, message_text, type, reference_id, send_by)
         VALUES ($1, $2, $3, 'order_dispatched', $4, now())`,
        [order.customer_phone, customerName, dispatchMsg, orderId]
      );
    } else if (nextStatus === "delivered" && order.status !== "delivered") {
      await runDeliveryTrigger(client, orderId as string);
    } else if (nextStatus === "cancelled" && order.status !== "cancelled") {
      if (order.discount_code && order.discount_code.startsWith("KRK-")) {
        await client.query(
          `UPDATE loyalty_codes SET used_at = NULL, used_on_order_id = NULL WHERE used_on_order_id = $1`,
          [orderId]
        );
      }
    } 

    await client.query(
      `UPDATE orders SET status = $1, tracking_number = $2 WHERE id = $3`, 
      [nextStatus, nextTracking, orderId]
    );

    await client.query("COMMIT");
    
    const updatedOrder = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    return res.status(200).json(updatedOrder.rows[0]);
    
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(400).json({ message: error.message || "Failed to update order" });
  } finally {
    client.release();
  }
};

// POST /orders/validate-discount
export const validateDiscount = async (req: Request, res: Response) => {
  try {
    const { customer_phone: rawCustomerPhone, discount_code, apply_first_time, customer_address, cart, total_amount } = req.body;

    if (!rawCustomerPhone) {
      return res.status(400).json({ message: "Customer phone is required for verification." });
    }

    let customerPhone;
    try {
      customerPhone = normalizePhone(rawCustomerPhone);
    } catch (err: any) {
      return res.status(400).json({ message: `Customer Phone Error: ${err.message}` });
    }
    
    let secure_subtotal = total_amount || 0;

    // Secure database lookup to verify prices from cart
    if (cart && Array.isArray(cart)) {
      let cartTotal = 0;
      for (const item of cart) {
        const dbSizeRes = await query(
          `SELECT ps.price 
           FROM product_sizes ps
           INNER JOIN products p ON ps.product_id = p.id
           WHERE p.slug = $1 AND ps.size = $2`,
          [item.slug, item.size]
        );
        const sizeRecord = dbSizeRes.rows[0];
        if (sizeRecord) {
          cartTotal += sizeRecord.price * item.quantity;
        }
      }
      secure_subtotal = cartTotal;
    }

    const creditRes = await query(
      `SELECT count(*) FROM referrals 
       WHERE referrer_phone = $1 
         AND status = 'completed' 
         AND referrer_reward_used_at IS NULL`,
      [customerPhone]
    );
    
    const creditCount = parseInt(creditRes.rows[0].count);
    if (creditCount > 0) {
      return res.json({
        valid: true,
        type: "referral_credit",
        discount_amount: 150,
        message: `Referral Credit applied! Rs 150 has been automatically deducted from this customer's order.`,
      });
    }

    const customerExistsRes = await query(
      `SELECT 1 FROM customers WHERE phone = $1`,
      [customerPhone]
    );
    const isNewCustomerForDiscount = customerExistsRes.rows.length === 0;

    if (isNewCustomerForDiscount && apply_first_time !== false) {
      if (customer_address) {
        const existingAddressesRes = await query(
          `SELECT DISTINCT c.phone, c.name, c.address FROM customers c
           INNER JOIN orders o ON o.customer_phone = c.phone
           WHERE c.phone != $1 AND o.status = 'delivered' AND c.address IS NOT NULL`,
          [customerPhone]
        );

        let fraudDetected = false;
        for (const row of existingAddressesRes.rows) {
          const score = calculateAddressSimilarity(customer_address, row.address);
          if (score >= 0.6) {
            fraudDetected = true;
            break;
          }
        }

        if (fraudDetected) {
          return res.json({
            valid: false,
            type: "fraud_flagged",
            message: `First-time discount suspended: Delivery address highly matches an existing registered customer.`
          });
        }
      }

      const calculated12Percent = secure_subtotal ? Math.round(secure_subtotal * 0.12) : 0;
      return res.json({
        valid: true,
        type: "first_time_discount",
        discount_amount: calculated12Percent,
        message: `First-Time Buyer discount applicable! You qualify for a 12% auto-deduction (Saved Rs. ${calculated12Percent})`,
      });
    }

    if (!discount_code) {
      return res.json({ valid: false, message: "No auto-credits available." });
    }

    if (discount_code.startsWith("KRK-")) {
      const codeRes = await query(`SELECT * FROM loyalty_codes WHERE code = $1`, [discount_code]);
      const loyaltyRecord = codeRes.rows[0];

      if (!loyaltyRecord) {
        return res.status(400).json({ message: "Invalid discount code. This code does not exist in our database." });
      }
      if (loyaltyRecord.customer_phone !== customerPhone) {
        return res.status(400).json({ message: "This loyalty code belongs to a different customer profile." });
      }
      if (loyaltyRecord.used_at) {
        return res.status(400).json({ message: "This loyalty code has already been redeemed on a prior order." });
      }
      if (new Date(loyaltyRecord.expires_at) < new Date()) {
        return res.status(400).json({ message: "This loyalty code has expired and is no longer valid." });
      }

      return res.json({
        valid: true,
        type: "loyalty",
        discount_amount: loyaltyRecord.discount_amount,
        message: "Loyalty code applied successfully!",
      });
    } else {
      let referrerPhone;
      try {
        referrerPhone = normalizePhone(discount_code);
      } catch (err: any) {
        return res.status(400).json({ message: `Referrer Phone Error: ${err.message}` });
      }

      if (referrerPhone === customerPhone) {
        return res.status(400).json({ message: "A customer cannot refer themselves." });
      }

      const referrerRes = await query(`SELECT name, address FROM customers WHERE phone = $1`, [referrerPhone]);
      if (referrerRes.rows.length === 0) {
        return res.status(404).json({ message: "The provided referrer number is not registered as a customer." });
      }

      const previousOrders = await query(
        `SELECT 1 FROM orders WHERE customer_phone = $1 AND status = 'delivered' LIMIT 1`,
        [customerPhone]
      );
      if (previousOrders.rows.length > 0) {
        return res.status(400).json({ message: "Referral discounts are restricted to a new customer's first delivered order." });
      }

      const existingReferral = await query(
        `SELECT 1 FROM referrals WHERE referrer_phone = $1 AND referee_phone = $2 LIMIT 1`,
        [referrerPhone, customerPhone]
      );
      if (existingReferral.rows.length > 0) {
        return res.status(400).json({ message: "This referral connection has already been recorded or is pending." });
      }

      return res.json({
        valid: true,
        type: "referral",
        discount_amount: 75,
        message: `Referral applied! Rs 75 off for the new customer.`,
        referrer_address: referrerRes.rows[0].address || null
      });
    }
  } catch (error: any) {
    console.error("Validation system failure:", error);
    return res.status(500).json({ message: `Internal server error during validation: ${error.message}` });
  }
};

// POST /orders/bulk-dispatch
export const bulkDispatchOrders = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { order_ids } = req.body;
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      throw new Error("No orders selected for dispatch.");
    }

    const requestedCount = order_ids.length;

    const ordersRes = await client.query(
      `SELECT o.id, o.customer_phone, o.order_number, c.name as customer_name 
       FROM orders o
       LEFT JOIN customers c ON o.customer_phone = c.phone
       WHERE o.id = ANY($1) AND o.status = 'confirmed' 
       FOR UPDATE OF o`, // <-- ADDED 'OF o' HERE
      [order_ids]
    );

    if (ordersRes.rows.length !== requestedCount) {
      throw new Error("One or more selected orders are not in 'confirmed' status or do not exist. Please refresh the page.");
    }

    const trackingRes = await client.query(
      `SELECT tracking_number FROM tracking_pool 
       WHERE used_on_order_id IS NULL 
       ORDER BY created_at ASC 
       LIMIT $1 
       FOR UPDATE SKIP LOCKED`,
      [requestedCount]
    );

    if (trackingRes.rows.length < requestedCount) {
      throw new Error(`Not enough tracking numbers available. Need ${requestedCount}, but only ${trackingRes.rows.length} are available. Please upload more tracking numbers.`);
    }

    const availableTrackingNumbers = trackingRes.rows.map(row => row.tracking_number);

    for (let i = 0; i < requestedCount; i++) {
      const order = ordersRes.rows[i];
      const assignedTracking = availableTrackingNumbers[i];

      await client.query(
        `UPDATE orders SET status = 'dispatched', tracking_number = $1 WHERE id = $2`,
        [assignedTracking, order.id]
      );

      await client.query(
        `UPDATE tracking_pool SET used_on_order_id = $1 WHERE tracking_number = $2`,
        [order.id, assignedTracking]
      );

      const dispatchMsg = `Hi ${order.customer_name || "Customer"}! Your Kurkees order ${order.order_number} has been dispatched. Tracking No: ${assignedTracking}.`;
      await client.query(
        `INSERT INTO message_queue (to_phone, to_name, message_text, type, reference_id, send_by)
         VALUES ($1, $2, $3, 'order_dispatched', $4, now())`,
        [order.customer_phone, order.customer_name, dispatchMsg, order.id]
      );
    }

    const finalDataRes = await client.query(
      `SELECT o.*, c.name as customer_name, c.address as customer_address, c.city as customer_city 
       FROM orders o
       LEFT JOIN customers c ON o.customer_phone = c.phone
       WHERE o.id = ANY($1)`,
      [order_ids]
    );

    await client.query("COMMIT");
    return res.status(200).json(finalDataRes.rows);

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Bulk dispatch error:", error);
    return res.status(400).json({ message: error.message || "Failed to bulk dispatch orders" });
  } finally {
    client.release();
  }
};