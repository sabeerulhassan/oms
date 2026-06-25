import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import { pool, query } from "../config/database"; // Imported pool to handle safe transactional clients

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// GET /products
export const getProducts = async (req: Request, res: Response) => {
  try {
    const productsRes = await query(`
      SELECT p.*, 
        COALESCE(json_agg(DISTINCT pi.*) FILTER (WHERE pi.id IS NOT NULL), '[]') as images,
        COALESCE(json_agg(DISTINCT ps.*) FILTER (WHERE ps.id IS NOT NULL), '[]') as sizes
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id
      LEFT JOIN product_sizes ps ON p.id = ps.product_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    return res.status(200).json({ data: productsRes.rows });
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /products/:slug (Supports both SEO slug and UUID queries polymorphically)
export const getProductBySlug = async (req: Request, res: Response) => {
    try {
      const slugParam = req.params.slug;
  
      // TypeScript Type Guard: Ensure the parameter is strictly a string
      if (typeof slugParam !== "string") {
        return res.status(400).json({ message: "Invalid product parameter format." });
      }
  
      // Regex check to see if the param is a valid UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugParam);
  
      const queryStr = isUUID 
        ? `SELECT * FROM products WHERE id = $1` 
        : `SELECT * FROM products WHERE slug = $1`;
  
      const productRes = await query(queryStr, [slugParam]);
      
      if (productRes.rows.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      const product = productRes.rows[0];
  
      const [imagesRes, sizesRes] = await Promise.all([
        query(`SELECT * FROM product_images WHERE product_id = $1 ORDER BY position ASC`, [product.id]),
        query(`
          SELECT ps.*, 
            COALESCE(json_agg(psi.*) FILTER (WHERE psi.id IS NOT NULL), '[]') as size_images
          FROM product_sizes ps
          LEFT JOIN product_size_images psi ON ps.id = psi.product_size_id
          WHERE ps.product_id = $1
          GROUP BY ps.id
          ORDER BY ps.price ASC
        `, [product.id])
      ]);
  
      product.images = imagesRes.rows;
      product.sizes = sizesRes.rows;
  
      return res.status(200).json({ data: product });
    } catch (error) {
      console.error("Failed to fetch product by slug/id:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };

// POST /products (Now safe with full SQL Transactions and Rollbacks)
export const createProduct = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const { slug, name, flavor, ingredients, description, usage, tags, default_youtube_id, images, sizes } = req.body;

    const productResult = await client.query(
      `INSERT INTO products (slug, name, flavor, ingredients, description, usage, tags, default_youtube_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [slug, name, flavor, ingredients, description, usage, tags || [], default_youtube_id || null]
    );
    const newProduct = productResult.rows[0];

    // Insert Product Images
    if (Array.isArray(images)) {
      for (let i = 0; i < images.length; i++) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, position) VALUES ($1, $2, $3)`,
          [newProduct.id, images[i], i]
        );
      }
    }

    // Insert Sizes and Size-Specific Images
    if (Array.isArray(sizes)) {
      for (const s of sizes) {
        const sizeRes = await client.query(
          `INSERT INTO product_sizes (product_id, size, price, in_stock, size_youtube_id) 
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [newProduct.id, s.size, Number(s.price), s.in_stock !== false, s.size_youtube_id || null]
        );
        const newSize = sizeRes.rows[0];

        if (Array.isArray(s.size_images)) {
          for (let idx = 0; idx < s.size_images.length; idx++) {
            await client.query(
              `INSERT INTO product_size_images (product_size_id, image_url, position) VALUES ($1, $2, $3)`,
              [newSize.id, s.size_images[idx], idx]
            );
          }
        }
      }
    }

    await client.query("COMMIT");
    return res.status(201).json(newProduct);
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Create product failed, transaction rolled back safely:", error);
    return res.status(400).json({ message: error.message || "Failed to create product" });
  } finally {
    client.release();
  }
};

// PUT /products/:id (Now safe with full SQL Transactions and Rollbacks)
export const updateProduct = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const productId = req.params.id;
    const { name, flavor, ingredients, description, usage, tags, default_youtube_id, images, sizes } = req.body;

    await client.query(
      `UPDATE products 
       SET name = $1, flavor = $2, ingredients = $3, description = $4, usage = $5, tags = $6, default_youtube_id = $7
       WHERE id = $8`,
      [name, flavor, ingredients, description, usage, tags || [], default_youtube_id || null, productId]
    );

    // Sync product images (Clear old ones first)
    if (Array.isArray(images)) {
      await client.query(`DELETE FROM product_images WHERE product_id = $1`, [productId]);
      for (let i = 0; i < images.length; i++) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, position) VALUES ($1, $2, $3)`,
          [productId, images[i], i]
        );
      }
    }

    // Sync product sizes
    if (Array.isArray(sizes)) {
      // Clear old nested records (Cascade constraint handles size images automatically)
      await client.query(`DELETE FROM product_sizes WHERE product_id = $1`, [productId]);
      for (const s of sizes) {
        const sizeRes = await client.query(
          `INSERT INTO product_sizes (product_id, size, price, in_stock, size_youtube_id) 
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [productId, s.size, Number(s.price), s.in_stock !== false, s.size_youtube_id || null]
        );
        const newSize = sizeRes.rows[0];

        if (Array.isArray(s.size_images)) {
          for (let idx = 0; idx < s.size_images.length; idx++) {
            await client.query(
              `INSERT INTO product_size_images (product_size_id, image_url, position) VALUES ($1, $2, $3)`,
              [newSize.id, s.size_images[idx], idx]
            );
          }
        }
      }
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "Product updated successfully." });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Update product failed, transaction rolled back safely:", error);
    return res.status(400).json({ message: error.message || "Failed to update product" });
  } finally {
    client.release();
  }
};

// DELETE /products/:id
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;
    await query(`DELETE FROM products WHERE id = $1`, [productId]);
    return res.status(200).json({ message: "Product deleted successfully." });
  } catch (error) {
    console.error("Delete product failed:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /products/upload/signature (Secure client-direct uploading signature)
export const getCloudinarySignature = async (req: Request, res: Response) => {
    try {
      console.log("=== GENERATING SECURE CLOUDINARY SIGNATURE ===");
      
      // Diagnostic checks on your .env configuration
      const configCheck = {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? "LOADED" : "MISSING ❌",
        api_key: process.env.CLOUDINARY_API_KEY ? "LOADED" : "MISSING ❌",
        api_secret: process.env.CLOUDINARY_API_SECRET ? "LOADED" : "MISSING ❌"
      };
      console.log("Cloudinary Environment Config Checks:", configCheck);
  
      if (!process.env.CLOUDINARY_API_SECRET) {
        throw new Error("CLOUDINARY_API_SECRET is missing from server environment variables.");
      }
  
      const timestamp = Math.round(new Date().getTime() / 1000);
      
      // The signed options must exactly match the body sent by the frontend
      const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder: "products" },
        process.env.CLOUDINARY_API_SECRET
      );
  
      console.log("Signature successfully generated:", signature);
      console.log("=== SIGNATURE GENERATION COMPLETED ===");
  
      return res.status(200).json({
        signature,
        timestamp,
        api_key: process.env.CLOUDINARY_API_KEY,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      });
    } catch (error: any) {
      console.error("❌ CLOUDINARY SIGNATURE FAILURE:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };