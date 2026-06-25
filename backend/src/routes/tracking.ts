import { Router } from "express";
import { uploadTrackingNumbers, getTrackingStats } from "../controllers/tracking";

const router = Router();

router.post("/upload", uploadTrackingNumbers);
router.get("/stats", getTrackingStats);

export default router;