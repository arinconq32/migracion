const express = require("express");
const router = express.Router();
const contactController = require("../controllers/contact.mongo.controller");

router.get("/", contactController.getContacts);
router.post("/lookup", contactController.lookupContacts);
router.post("/", contactController.createContact);
router.put("/:id", contactController.updateContact);
router.delete("/:id", contactController.deleteContact);

module.exports = router;
