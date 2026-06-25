import { Router } from "express";
import { createOrder, getOrders, updateOrderStatus, validateDiscount, bulkDispatchOrders } from "../controllers/orders";

const router = Router();

router.post("/", createOrder);
router.get("/", getOrders);
router.post("/validate-discount", validateDiscount);
router.post("/bulk-dispatch", bulkDispatchOrders); // <-- Add this new route
router.patch("/:id", updateOrderStatus);

export default router;