import { Request, Response } from "express";
import { query } from "../config/database"; // Assume you have a configured pg pool here
import { normalizePhone } from "../utils/phone";

// POST /customers
export const createCustomer = async (req: Request, res: Response) => {
  try {
    const { phone, name, address, city } = req.body; // <-- Added city

    if (!name || name.length > 100) {
      return res.status(400).json({ error: "Valid name is required (max 100 chars)" });
    }

    const normalizedPhone = normalizePhone(phone);

    const result = await query(
      `INSERT INTO customers (phone, name, address, city) VALUES ($1, $2, $3, $4) RETURNING *`,
      [normalizedPhone, name, address || null, city || null] // <-- Added city parameter
    );

    return res.status(201).json(result.rows[0]);
  } catch (error: any) {
    // Handle Postgres Unique Violation
    if (error.code === "23505") {
      return res.status(409).json({ error: "CUSTOMER_EXISTS" });
    }
    if (error.message.includes("Invalid phone number format")) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// GET /customers
export const getCustomers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search ? (req.query.search as string) : "";
    const offset = (page - 1) * limit;

    let dataQuery = `SELECT * FROM customers`;
    let countQuery = `SELECT count(*) FROM customers`;
    const queryParams: any[] = [];
    const countParams: any[] = [];

    // Apply search filter if provided
    if (search) {
      const searchStr = `%${search}%`;
      const searchClause = ` WHERE name ILIKE $1 OR phone ILIKE $1`;
      dataQuery += searchClause;
      countQuery += searchClause;
      queryParams.push(searchStr);
      countParams.push(searchStr);
    }

    // Add Ordering, Limit, and Offset
    dataQuery += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    // Execute queries in parallel
    const [dataResult, countResult] = await Promise.all([
      query(dataQuery, queryParams),
      query(countQuery, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count);

    return res.status(200).json({
      data: dataResult.rows,
      meta: {
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// GET /customers/:phone
export const getCustomerByPhone = async (req: Request, res: Response) => {
  try {
    const normalizedPhone = normalizePhone(req.params.phone as string);

    // Fetch customer profile
    const customerResult = await query(`SELECT * FROM customers WHERE phone = $1`, [normalizedPhone]);
    
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const customer = customerResult.rows[0];

    // Fetch nested relations in parallel
    const [ordersResult, loyaltyResult, referralsResult] = await Promise.all([
      query(`SELECT * FROM orders WHERE customer_phone = $1 ORDER BY created_at DESC`, [normalizedPhone]),
      query(`SELECT * FROM loyalty_codes WHERE customer_phone = $1 ORDER BY created_at DESC`, [normalizedPhone]),
      query(`SELECT * FROM referrals WHERE referrer_phone = $1 ORDER BY created_at DESC`, [normalizedPhone]),
    ]);

    // Attach nested data
    customer.orders = ordersResult.rows;
    customer.loyalty_codes = loyaltyResult.rows;
    customer.referrals_given = referralsResult.rows;

    return res.status(200).json(customer);
  } catch (error: any) {
    if (error.message.includes("Invalid phone number format")) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// PATCH /customers/:phone
export const updateCustomer = async (req: Request, res: Response) => {
  try {
     const normalizedPhone = normalizePhone(req.params.phone as string);

     const { name, opted_in, address, city } = req.body; // <-- Added city here

    // Build dynamic update query using COALESCE to only update provided fields
    const result = await query(
      `UPDATE customers 
       SET 
         name = COALESCE($1, name), 
         opted_in = COALESCE($2, opted_in),
         address = COALESCE($3, address),
         city = COALESCE($4, city) -- <-- Added city check
       WHERE phone = $5 
       RETURNING *`,
      [name ?? null, opted_in ?? null, address ?? null, city ?? null, normalizedPhone]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error: any) {
    if (error.message.includes("Invalid phone number format")) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};