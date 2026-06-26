import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import { pool, query } from "../config/database"; // Imported pool to handle safe transactional clients

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type AnyRecord = Record<string, any>;

const CLOUDINARY_BASE_URL = process.env.CLOUDINARY_CLOUD_NAME
  ? `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`
  : "";

const IMAGE_TRANSFORMS = {
  thumbnail: "c_fill,w_500,h_500,q_auto,f_auto",
  medium: "c_fit,w_900,q_auto,f_auto",
  full: "q_auto,f_auto",
};

function isBadImageValue(value: unknown): boolean {
  if (!value || typeof value !== "string") return true;

  const raw = value.trim();
  const lower = raw.toLowerCase();

  return (
    !raw ||
    raw === "[object Object]" ||
    lower === "undefined" ||
    lower === "null" ||
    lower.includes("placeholder.svg") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:")
  );
}

function normalizeCloudinaryOrUrl(value: unknown): string | null {
  if (isBadImageValue(value)) return null;

  const raw = String(value).trim();

  // Already a usable absolute URL.
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  // If admin accidentally sends only a Cloudinary public_id such as:
  // "products/my-image" or "products/my-image.png", turn it into a delivery URL.
  if (CLOUDINARY_BASE_URL) {
    return `${CLOUDINARY_BASE_URL}/${raw.replace(/^\/+/, "")}`;
  }

  // Without Cloudinary config, plain/relative paths cannot be rendered reliably.
  return null;
}

function applyCloudinaryTransform(url: string, transform: string): string {
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(url)) return url;
  if (!url.includes("/image/upload/")) return url;

  return url.replace("/image/upload/", `/image/upload/${transform}/`);
}

function getBestImageUrl(image: unknown): string | null {
  if (typeof image === "string") {
    return normalizeCloudinaryOrUrl(image);
  }

  if (!image || typeof image !== "object") return null;

  const record = image as AnyRecord;

  return (
    normalizeCloudinaryOrUrl(record.image_url) ||
    normalizeCloudinaryOrUrl(record.secure_url) ||
    normalizeCloudinaryOrUrl(record.url) ||
    normalizeCloudinaryOrUrl(record.imageUrl) ||
    normalizeCloudinaryOrUrl(record.src) ||
    normalizeCloudinaryOrUrl(record.full_url) ||
    normalizeCloudinaryOrUrl(record.medium_url) ||
    normalizeCloudinaryOrUrl(record.thumbnail_url) ||
    null
  );
}

function normalizePosition(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decorateImageRecord(
  image: unknown,
  fallbackAltText: string,
  fallbackPosition = 0
): AnyRecord | null {
  const imageUrl = getBestImageUrl(image);

  if (!imageUrl) return null;

  const record = image && typeof image === "object" ? (image as AnyRecord) : {};

  const thumbnailUrl =
    normalizeCloudinaryOrUrl(record.thumbnail_url) ||
    applyCloudinaryTransform(imageUrl, IMAGE_TRANSFORMS.thumbnail);

  const mediumUrl =
    normalizeCloudinaryOrUrl(record.medium_url) ||
    applyCloudinaryTransform(imageUrl, IMAGE_TRANSFORMS.medium);

  const fullUrl =
    normalizeCloudinaryOrUrl(record.full_url) ||
    applyCloudinaryTransform(imageUrl, IMAGE_TRANSFORMS.full);

  return {
    ...record,
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    medium_url: mediumUrl,
    full_url: fullUrl,
    alt_text: record.alt_text || record.alt || fallbackAltText,
    position: normalizePosition(record.position, fallbackPosition),
  };
}

function decorateImageArray(
  images: unknown,
  fallbackAltText: string
): AnyRecord[] {
  if (!Array.isArray(images)) return [];

  return images
    .map((image, index) => decorateImageRecord(image, fallbackAltText, index))
    .filter(Boolean) as AnyRecord[];
}

function decorateProductRow(product: AnyRecord): AnyRecord {
  const productImages = decorateImageArray(
    product.images,
    `${product.name || "Kurkees product"} jar`
  );

  const sizes = Array.isArray(product.sizes)
    ? product.sizes.map((size: AnyRecord) => ({
        ...size,
        size_images: decorateImageArray(
          size.size_images,
          `${product.name || "Kurkees product"} ${size.size || ""} jar`.trim()
        ),
      }))
    : [];

  return {
    ...product,
    images: productImages,
    sizes,
  };
}

function normalizeIncomingImageUrl(image: unknown): string | null {
  return getBestImageUrl(image);
}

function normalizeIncomingImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];

  return images
    .map(normalizeIncomingImageUrl)
    .filter(Boolean) as string[];
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (
      ["false", "0", "no", "out", "out-of-stock", "out_of_stock", "unavailable"].includes(
        normalized
      )
    ) {
      return false;
    }

    if (
      ["true", "1", "yes", "in", "in-stock", "in_stock", "available"].includes(
        normalized
      )
    ) {
      return true;
    }
  }

  return fallback;
}

// GET /products
export const getProducts = async (req: Request, res: Response) => {
  try {
    const productsRes = await query(`
      SELECT
        p.*,
        COALESCE(product_images.images, '[]'::json) AS images,
        COALESCE(product_sizes.sizes, '[]'::json) AS sizes
      FROM products p
      LEFT JOIN LATERAL (
        SELECT json_agg(row_to_json(pi_ordered) ORDER BY pi_ordered.position ASC) AS images
        FROM (
          SELECT pi.*
          FROM product_images pi
          WHERE pi.product_id = p.id
            AND pi.image_url IS NOT NULL
            AND btrim(pi.image_url) <> ''
          ORDER BY pi.position ASC
        ) pi_ordered
      ) product_images ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(row_to_json(size_rows) ORDER BY size_rows.price ASC) AS sizes
        FROM (
          SELECT
            ps.*,
            COALESCE(size_images.size_images, '[]'::json) AS size_images
          FROM product_sizes ps
          LEFT JOIN LATERAL (
            SELECT json_agg(row_to_json(psi_ordered) ORDER BY psi_ordered.position ASC) AS size_images
            FROM (
              SELECT psi.*
              FROM product_size_images psi
              WHERE psi.product_size_id = ps.id
                AND psi.image_url IS NOT NULL
                AND btrim(psi.image_url) <> ''
              ORDER BY psi.position ASC
            ) psi_ordered
          ) size_images ON true
          WHERE ps.product_id = p.id
          ORDER BY ps.price ASC
        ) size_rows
      ) product_sizes ON true
      ORDER BY p.created_at DESC
    `);

    const decoratedProducts = productsRes.rows.map(decorateProductRow);

    return res.status(200).json({ data: decoratedProducts });
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
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        slugParam
      );

    const queryStr = isUUID
      ? `SELECT * FROM products WHERE id = $1`
      : `SELECT * FROM products WHERE slug = $1`;

    const productRes = await query(queryStr, [slugParam]);

    if (productRes.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productRes.rows[0];

    const [imagesRes, sizesRes] = await Promise.all([
      query(
        `
        SELECT *
        FROM product_images
        WHERE product_id = $1
          AND image_url IS NOT NULL
          AND btrim(image_url) <> ''
        ORDER BY position ASC
        `,
        [product.id]
      ),
      query(
        `
        SELECT
          ps.*,
          COALESCE(size_images.size_images, '[]'::json) AS size_images
        FROM product_sizes ps
        LEFT JOIN LATERAL (
          SELECT json_agg(row_to_json(psi_ordered) ORDER BY psi_ordered.position ASC) AS size_images
          FROM (
            SELECT psi.*
            FROM product_size_images psi
            WHERE psi.product_size_id = ps.id
              AND psi.image_url IS NOT NULL
              AND btrim(psi.image_url) <> ''
            ORDER BY psi.position ASC
          ) psi_ordered
        ) size_images ON true
        WHERE ps.product_id = $1
        ORDER BY ps.price ASC
        `,
        [product.id]
      ),
    ]);

    product.images = imagesRes.rows;
    product.sizes = sizesRes.rows;

    return res.status(200).json({ data: decorateProductRow(product) });
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

    const {
      slug,
      name,
      flavor,
      ingredients,
      description,
      usage,
      tags,
      default_youtube_id,
      images,
      sizes,
    } = req.body;

    const productResult = await client.query(
      `INSERT INTO products (slug, name, flavor, ingredients, description, usage, tags, default_youtube_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        slug,
        name,
        flavor,
        ingredients,
        description,
        usage,
        tags || [],
        default_youtube_id || null,
      ]
    );

    const newProduct = productResult.rows[0];

    // Insert Product Images.
    // Accepts old string format and new object format from admin Cloudinary uploader.
    const normalizedProductImages = normalizeIncomingImages(images);

    for (let i = 0; i < normalizedProductImages.length; i++) {
      await client.query(
        `INSERT INTO product_images (product_id, image_url, position) VALUES ($1, $2, $3)`,
        [newProduct.id, normalizedProductImages[i], i]
      );
    }

    // Insert Sizes and Size-Specific Images
    if (Array.isArray(sizes)) {
      for (const s of sizes) {
        const sizeRes = await client.query(
          `INSERT INTO product_sizes (product_id, size, price, in_stock, size_youtube_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            newProduct.id,
            s.size,
            Number(s.price),
            normalizeBoolean(s.in_stock, true),
            s.size_youtube_id || null,
          ]
        );

        const newSize = sizeRes.rows[0];
        const normalizedSizeImages = normalizeIncomingImages(s.size_images);

        for (let idx = 0; idx < normalizedSizeImages.length; idx++) {
          await client.query(
            `INSERT INTO product_size_images (product_size_id, image_url, position) VALUES ($1, $2, $3)`,
            [newSize.id, normalizedSizeImages[idx], idx]
          );
        }
      }
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Product created successfully.",
      data: decorateProductRow({
        ...newProduct,
        images: normalizedProductImages.map((image_url, position) => ({
          image_url,
          position,
        })),
        sizes: [],
      }),
    });
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

    const {
      name,
      flavor,
      ingredients,
      description,
      usage,
      tags,
      default_youtube_id,
      images,
      sizes,
    } = req.body;

    await client.query(
      `UPDATE products
       SET name = $1, flavor = $2, ingredients = $3, description = $4, usage = $5, tags = $6, default_youtube_id = $7
       WHERE id = $8`,
      [
        name,
        flavor,
        ingredients,
        description,
        usage,
        tags || [],
        default_youtube_id || null,
        productId,
      ]
    );

    // Sync product images.
    // This only runs when `images` is explicitly supplied, preserving old images otherwise.
    if (Array.isArray(images)) {
      await client.query(`DELETE FROM product_images WHERE product_id = $1`, [productId]);

      const normalizedProductImages = normalizeIncomingImages(images);

      for (let i = 0; i < normalizedProductImages.length; i++) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, position) VALUES ($1, $2, $3)`,
          [productId, normalizedProductImages[i], i]
        );
      }
    }

    // Sync product sizes.
    // This only runs when `sizes` is explicitly supplied, preserving old sizes otherwise.
    if (Array.isArray(sizes)) {
      // Clear old nested records. Cascade constraint handles size images automatically.
      await client.query(`DELETE FROM product_sizes WHERE product_id = $1`, [productId]);

      for (const s of sizes) {
        const sizeRes = await client.query(
          `INSERT INTO product_sizes (product_id, size, price, in_stock, size_youtube_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            productId,
            s.size,
            Number(s.price),
            normalizeBoolean(s.in_stock, true),
            s.size_youtube_id || null,
          ]
        );

        const newSize = sizeRes.rows[0];
        const normalizedSizeImages = normalizeIncomingImages(s.size_images);

        for (let idx = 0; idx < normalizedSizeImages.length; idx++) {
          await client.query(
            `INSERT INTO product_size_images (product_size_id, image_url, position) VALUES ($1, $2, $3)`,
            [newSize.id, normalizedSizeImages[idx], idx]
          );
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
      api_secret: process.env.CLOUDINARY_API_SECRET ? "LOADED" : "MISSING ❌",
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
