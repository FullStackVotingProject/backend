const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

// Get active polls for voting
router.get('/active-polls', auth, async (req, res) => {
    try {
        const currentTime = new Date();
        const [polls] = await db.query(`
            SELECT p.*, 
                   COUNT(DISTINCT pq.id) as question_count,
                   COUNT(DISTINCT v.id) as vote_count,
                   EXISTS (
                       SELECT 1 
                       FROM votes v2 
                       INNER JOIN poll_questions pq2 ON v2.question_id = pq2.id 
                       WHERE pq2.poll_id = p.id AND v2.user_id = ?
                   ) as has_voted
            FROM polls p
            LEFT JOIN poll_questions pq ON p.id = pq.poll_id
            LEFT JOIN votes v ON pq.id = v.question_id
            WHERE p.status = 'active'
            AND p.start_time <= ?
            AND p.end_time > ?
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `, [req.user.id, currentTime, currentTime]);

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
                           COUNT(DISTINCT v.id) as vote_count,
                           EXISTS (
                               SELECT 1 
                               FROM votes v2 
                               WHERE v2.option_id = o.id AND v2.user_id = ?
                           ) as user_selected
                    FROM poll_options o
                    LEFT JOIN votes v ON o.id = v.option_id
                    WHERE o.question_id = ?
                    GROUP BY o.id
                    ORDER BY o.option_order
                `, [req.user.id, question.id]);
                question.options = options;
            }
            poll.questions = questions;
        }

        res.json(polls);
    } catch (error) {
        console.error('Error fetching active polls:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Submit vote
router.post('/submit', [
    auth,
    check('pollId').isInt(),
    check('votes').isArray(),
    check('votes.*.questionId').isInt(),
    check('votes.*.optionId').isInt()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { pollId, votes } = req.body;
        const currentTime = new Date();

        // Check if poll is active and within time limits
        const [polls] = await connection.query(`
            SELECT * FROM polls 
            WHERE id = ? 
            AND status = 'active'
            AND start_time <= ?
            AND end_time > ?
        `, [pollId, currentTime, currentTime]);

        if (polls.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'Poll is not active or has expired' });
        }

        // Check if user has already voted in this poll
        const [existingVotes] = await connection.query(`
            SELECT v.* 
            FROM votes v
            INNER JOIN poll_questions q ON v.question_id = q.id
            WHERE q.poll_id = ? AND v.user_id = ?
            LIMIT 1
        `, [pollId, req.user.id]);

        if (existingVotes.length > 0) {
            await connection.rollback();
            return res.status(400).json({ message: 'You have already voted in this poll' });
        }

        // Verify all questions belong to the poll and insert votes
        for (const vote of votes) {
            const [questions] = await connection.query(
                'SELECT * FROM poll_questions WHERE id = ? AND poll_id = ?',
                [vote.questionId, pollId]
            );

            if (questions.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: 'Invalid question ID' });
            }

            const [options] = await connection.query(
                'SELECT * FROM poll_options WHERE id = ? AND question_id = ?',
                [vote.optionId, vote.questionId]
            );

            if (options.length === 0) {
                await connection.rollback();
                return res.status(400).json({ message: 'Invalid option ID' });
            }

            await connection.query(
                'INSERT INTO votes (user_id, question_id, option_id) VALUES (?, ?, ?)',
                [req.user.id, vote.questionId, vote.optionId]
            );
        }

        await connection.commit();
        res.json({ message: 'Vote submitted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error submitting vote:', error);
        res.status(500).json({ message: 'Server error' });
    } finally {
        connection.release();
    }
});

// Get poll results
router.get('/results/:pollId', auth, async (req, res) => {
    try {
        const [polls] = await db.query(`
            SELECT p.*, 
                   COUNT(DISTINCT v.id) as total_votes
            FROM polls p
            LEFT JOIN poll_questions pq ON p.id = pq.poll_id
            LEFT JOIN votes v ON pq.id = v.question_id
            WHERE p.id = ?
            GROUP BY p.id
        `, [req.params.pollId]);

        if (polls.length === 0) {
            return res.status(404).json({ message: 'Poll not found' });
        }

        const poll = polls[0];

        // Get questions with vote counts
        const [questions] = await db.query(`
            SELECT q.*, 
                   COUNT(DISTINCT v.id) as vote_count
            FROM poll_questions q
            LEFT JOIN votes v ON q.id = v.question_id
            WHERE q.poll_id = ?
            GROUP BY q.id
            ORDER BY q.question_order
        `, [poll.id]);

        // Get options with vote counts for each question
        for (let question of questions) {
            const [options] = await db.query(`
                SELECT o.*, 
                       COUNT(DISTINCT v.id) as vote_count,
                       ROUND(COUNT(DISTINCT v.id) * 100.0 / NULLIF((
                           SELECT COUNT(DISTINCT v2.id)
                           FROM votes v2
                           WHERE v2.question_id = ?
                       ), 0), 2) as percentage
                FROM poll_options o
                LEFT JOIN votes v ON o.id = v.option_id
                WHERE o.question_id = ?
                GROUP BY o.id
                ORDER BY o.option_order
            `, [question.id, question.id]);
            question.options = options;
        }

        poll.questions = questions;
        res.json(poll);
    } catch (error) {
        console.error('Error fetching poll results:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get completed polls
router.get('/completed-polls', auth, async (req, res) => {
    try {
        const currentTime = new Date();
        const [polls] = await db.query(`
            SELECT p.*, 
                   COUNT(DISTINCT v.id) as total_votes
            FROM polls p
            LEFT JOIN poll_questions pq ON p.id = pq.poll_id
            LEFT JOIN votes v ON pq.id = v.question_id
            WHERE p.end_time < ?
            GROUP BY p.id
            ORDER BY p.end_time DESC
        `, [currentTime]);

        res.json(polls);
    } catch (error) {
        console.error('Error fetching completed polls:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
