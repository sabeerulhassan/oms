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

// Admin-only protected routes
router.get("/upload/signature", requireAuth, getCloudinarySignature);
router.post("/", requireAuth, createProduct);
router.put("/:id", requireAuth, updateProduct);
router.delete("/:id", requireAuth, deleteProduct);

router.get("/:slug", getProductBySlug);

export default router;