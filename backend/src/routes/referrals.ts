import { Router } from "express";
import { sendOptIn, confirmOptIn, updateReferralStatus } from "../controllers/referrals";

const router = Router();

router.post("/optin", sendOptIn);
router.post("/confirm-optin", confirmOptIn);
router.patch("/:id", updateReferralStatus);

export default router;