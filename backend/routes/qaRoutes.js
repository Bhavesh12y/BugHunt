const express = require('express');
const router = express.Router();
const qaController = require('../controllers/qaController');

router.post('/run-qa', qaController.runQaPipeline);

module.exports = router;