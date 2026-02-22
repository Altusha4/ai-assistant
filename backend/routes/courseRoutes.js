const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const ctrl = require('../controllers/courseController');
const { authenticateToken } = require('../auth');

router.get('/', authenticateToken, ctrl.getAll);

router.post('/upload', authenticateToken, upload.single('file'), ctrl.upload);

router.post('/quiz', authenticateToken, ctrl.getQuiz);

router.post('/explain-topic', authenticateToken, ctrl.explainTopic);

router.post('/:id/toggle-topic', authenticateToken, ctrl.toggleTopic);

router.post('/:id/music', authenticateToken, ctrl.addMusic);

router.delete('/:id', authenticateToken, ctrl.delete);

module.exports = router;