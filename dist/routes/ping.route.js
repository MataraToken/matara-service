"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const router = require("express").Router();
router.get("/", (req, res) => res.status(200).send("pong"));
exports.default = router;
//# sourceMappingURL=ping.route.js.map