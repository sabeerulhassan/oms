import { Router } from "express";
import { getMessages, markAsSent } from "../controllers/messages";

const router = Router();

router.get("/", getMessages);
router.patch("/:id/sent", markAsSent);

export default router;