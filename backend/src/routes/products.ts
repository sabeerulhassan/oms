import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { 
  getProducts, 
  getProductBySlug, 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  getCloudinarySignature 
} from "../controllers/products";

const router = Router();

// Public routes
router.get("/", getProducts);
router.get("/:slug", getProductBySlug);

// Admin-only protected routes
router.post("/", requireAuth, createProduct);
router.put("/:id", requireAuth, updateProduct);
router.delete("/:id", requireAuth, deleteProduct);
router.get("/upload/signature", requireAuth, getCloudinarySignature);

export default router;