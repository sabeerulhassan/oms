import { Router } from "express";
import {
  createCustomer,
  getCustomers,
  getCustomerByPhone,
  updateCustomer,
} from "../controllers/customers";

const router = Router();

router.post("/", createCustomer);
router.get("/", getCustomers);
router.get("/:phone", getCustomerByPhone);
router.patch("/:phone", updateCustomer);

export default router;