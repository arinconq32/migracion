const express = require("express");
const mediaController = require("../controllers/media.controller");

const router = express.Router();

router.get("/proxy", mediaController.proxyMedia);

module.exports = router;
