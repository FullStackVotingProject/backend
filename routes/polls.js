const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

// Get all polls
router.get('/', auth, async (req, res) => {
    try {
        const [polls] = await db.query(`
            SELECT p.*, 
                   COUNT(DISTINCT pq.id) as question_count,
                   COUNT(DISTINCT v.id) as vote_count
            FROM polls p
            LEFT JOIN poll_questions pq ON p.id = pq.poll_id
            LEFT JOIN votes v ON pq.id = v.question_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `);

        // For each poll, fetch its questions and options
        for (let poll of polls) {
            const [questions] = await db.query(`
                SELECT q.*, 
                       COUNT(DISTINCT v.id) as vote_count
                FROM poll_questions q
                LEFT JOIN votes v ON q.id = v.question_id
                WHERE q.poll_id = ?
                GROUP BY q.id
                ORDER BY q.question_order
            `, [poll.id]);

            for (let question of questions) {
                const [options] = await db.query(`
                    SELECT o.*, 
                           COUNT(DISTINCT v.id) as vote_count
                    FROM poll_options o
                    LEFT JOIN votes v ON o.id = v.option_id
                    WHERE o.question_id = ?
                    GROUP BY o.id
                    ORDER BY o.option_order
                `, [question.id]);
                question.options = options;
            }
            poll.questions = questions;
        }

        res.json(polls);
    } catch (error) {
        console.error('Error fetching polls:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get a single poll by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const [polls] = await db.query('SELECT * FROM polls WHERE id = ?', [req.params.id]);
        
        if (polls.length === 0) {
            return res.status(404).json({ message: 'Poll not found' });
        }

        const poll = polls[0];

        // Fetch questions
        const [questions] = await db.query(`
            SELECT q.*, COUNT(DISTINCT v.id) as vote_count
            FROM poll_questions q
            LEFT JOIN votes v ON q.id = v.question_id
            WHERE q.poll_id = ?
            GROUP BY q.id
            ORDER BY q.question_order
        `, [poll.id]);

        // Fetch options for each question
        for (let question of questions) {
            const [options] = await db.query(`
                SELECT o.*, COUNT(DISTINCT v.id) as vote_count
                FROM poll_options o
                LEFT JOIN votes v ON o.id = v.option_id
                WHERE o.question_id = ?
                GROUP BY o.id
                ORDER BY o.option_order
            `, [question.id]);
            question.options = options;
        }

        poll.questions = questions;
        res.json(poll);
    } catch (error) {
        console.error('Error fetching poll:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create a new poll
router.post('/', [
    auth,
    check('title').notEmpty().trim(),
    check('description').optional().trim(),
    check('durationMinutes').isInt({ min: 1 }),
    check('questions').isArray({ min: 1 }),
    check('questions.*.text').notEmpty().trim(),
    check('questions.*.options').isArray({ min: 2 }),
    check('questions.*.options.*').notEmpty().trim()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { title, description, durationMinutes, questions } = req.body;
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

        // Insert poll
        const [result] = await connection.query(
            'INSERT INTO polls (title, description, start_time, duration_minutes, end_time, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, description, startTime, durationMinutes, endTime, 'active', req.user.id]
        );

        const pollId = result.insertId;

        // Insert questions and options
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const [questionResult] = await connection.query(
                'INSERT INTO poll_questions (poll_id, question_text, question_order) VALUES (?, ?, ?)',
                [pollId, question.text, i + 1]
            );

            const questionId = questionResult.insertId;

            for (let j = 0; j < question.options.length; j++) {
                await connection.query(
                    'INSERT INTO poll_options (question_id, option_text, option_order) VALUES (?, ?, ?)',
                    [questionId, question.options[j], j + 1]
                );
            }
        }

        await connection.commit();

        // Initialize poll session timer
        req.pollSessionService.addPollSession(pollId, endTime);

        res.status(201).json({
            message: 'Poll created successfully',
            pollId: pollId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating poll:', error);
        res.status(500).json({ message: 'Server error' });
    } finally {
        connection.release();
    }
});

// Delete a poll
router.delete('/:id', auth, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check if poll exists and user has permission
        const [polls] = await connection.query(
            'SELECT * FROM polls WHERE id = ? AND created_by = ?',
            [req.params.id, req.user.id]
        );

        if (polls.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Poll not found or unauthorized' });
        }

        // Delete votes first (due to foreign key constraints)
        await connection.query(`
            DELETE v FROM votes v
            INNER JOIN poll_questions q ON v.question_id = q.id
            WHERE q.poll_id = ?
        `, [req.params.id]);

        // Delete options
        await connection.query(`
            DELETE o FROM poll_options o
            INNER JOIN poll_questions q ON o.question_id = q.id
            WHERE q.poll_id = ?
        `, [req.params.id]);

        // Delete questions
        await connection.query('DELETE FROM poll_questions WHERE poll_id = ?', [req.params.id]);

        // Finally, delete the poll
        await connection.query('DELETE FROM polls WHERE id = ?', [req.params.id]);

        await connection.commit();
        res.json({ message: 'Poll deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error deleting poll:', error);
        res.status(500).json({ message: 'Server error' });
    } finally {
        connection.release();
    }
});

module.exports = router;
