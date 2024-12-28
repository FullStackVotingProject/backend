const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

// Log all routes
router.use((req, res, next) => {
    console.log('Poll route accessed:', {
        method: req.method,
        path: req.path,
        params: req.params,
        query: req.query,
        body: req.body
    });
    next();
});

// Get all polls (both active and ended)
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

            // Add status field to each poll
            const currentDate = new Date();
            const endDate = new Date(poll.end_time);
            
            // Ensure both dates are in the same timezone for comparison
            const currentUTC = Date.UTC(
                currentDate.getUTCFullYear(),
                currentDate.getUTCMonth(),
                currentDate.getUTCDate(),
                currentDate.getUTCHours(),
                currentDate.getUTCMinutes(),
                currentDate.getUTCSeconds()
            );
            
            const endUTC = Date.UTC(
                endDate.getUTCFullYear(),
                endDate.getUTCMonth(),
                endDate.getUTCDate(),
                endDate.getUTCHours(),
                endDate.getUTCMinutes(),
                endDate.getUTCSeconds()
            );
            
            poll.status = currentUTC < endUTC ? 'active' : 'ended';
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

        // Add status field to each poll
        const currentDate = new Date();
        const endDate = new Date(poll.end_time);
        
        // Ensure both dates are in the same timezone for comparison
        const currentUTC = Date.UTC(
            currentDate.getUTCFullYear(),
            currentDate.getUTCMonth(),
            currentDate.getUTCDate(),
            currentDate.getUTCHours(),
            currentDate.getUTCMinutes(),
            currentDate.getUTCSeconds()
        );
        
        const endUTC = Date.UTC(
            endDate.getUTCFullYear(),
            endDate.getUTCMonth(),
            endDate.getUTCDate(),
            endDate.getUTCHours(),
            endDate.getUTCMinutes(),
            endDate.getUTCSeconds()
        );
        
        poll.status = currentUTC < endUTC ? 'active' : 'ended';

        res.json(poll);
    } catch (error) {
        console.error('Error fetching poll:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get a single poll by ID with vote details
router.get('/:id/votes', auth, async (req, res) => {
    const pollId = req.params.id;
    console.log(`Fetching votes for poll ID: ${pollId}`);
    
    try {
        // First, verify the poll exists and user has access
        const [polls] = await db.query(
            'SELECT * FROM polls WHERE id = ?',
            [pollId]
        );
        
        if (!polls || polls.length === 0) {
            console.log(`Poll not found: ${pollId}`);
            return res.status(404).json({
                success: false,
                message: 'Poll not found'
            });
        }

        // Get poll questions
        const [questions] = await db.query(
            'SELECT * FROM poll_questions WHERE poll_id = ? ORDER BY question_order',
            [pollId]
        );
        console.log(`Found ${questions.length} questions for poll ${pollId}`);

        // Get options and votes for each question
        for (let question of questions) {
            const [options] = await db.query(`
                SELECT 
                    o.*,
                    COUNT(DISTINCT v.id) as vote_count
                FROM poll_options o
                LEFT JOIN votes v ON o.id = v.option_id AND v.question_id = ?
                WHERE o.question_id = ?
                GROUP BY o.id
                ORDER BY o.option_order
            `, [question.id, question.id]);
            
            question.options = options;
            console.log(`Found ${options.length} options for question ${question.id}`);
        }

        // Get votes with user details
        const [votes] = await db.query(`
            SELECT 
                v.id as vote_id,
                v.user_id,
                v.voted_at as vote_time,
                u.username,
                u.email,
                q.id as question_id,
                q.question_text,
                o.option_text
            FROM votes v
            JOIN users u ON v.user_id = u.id
            JOIN poll_options o ON v.option_id = o.id
            JOIN poll_questions q ON v.question_id = q.id
            WHERE q.poll_id = ?
            ORDER BY v.user_id, v.voted_at
        `, [pollId]);
        console.log(`Found ${votes.length} votes for poll ${pollId}`);

        // Process votes into user-based structure
        const votersMap = new Map();
        votes.forEach(vote => {
            if (!votersMap.has(vote.user_id)) {
                votersMap.set(vote.user_id, {
                    id: vote.user_id,
                    username: vote.username,
                    email: vote.email,
                    votes: []
                });
            }
            votersMap.get(vote.user_id).votes.push({
                vote_id: vote.vote_id,
                question_id: vote.question_id,
                question_text: vote.question_text,
                option_text: vote.option_text,
                vote_time: vote.vote_time
            });
        });

        // Prepare response
        const response = {
            success: true,
            poll: {
                id: polls[0].id,
                title: polls[0].title,
                description: polls[0].description,
                start_time: polls[0].start_time,
                end_time: polls[0].end_time,
                created_at: polls[0].created_at,
                status: new Date() < new Date(polls[0].end_time) ? 'active' : 'ended',
                questions: questions.map(q => ({
                    id: q.id,
                    question_text: q.question_text,
                    question_order: q.question_order,
                    options: (q.options || []).map(o => ({
                        id: o.id,
                        option_text: o.option_text,
                        option_order: o.option_order,
                        vote_count: o.vote_count || 0
                    }))
                })),
                voters: Array.from(votersMap.values()),
                statistics: {
                    total_questions: questions.length,
                    total_voters: votersMap.size,
                    total_votes: votes.length
                }
            }
        };

        console.log('Successfully prepared response');
        return res.json(response);

    } catch (error) {
        console.error('Error in /polls/:id/votes:', error);
        console.error('Stack trace:', error.stack);

        // Check for specific database errors
        if (error.code) {
            console.error('Database error code:', error.code);
            console.error('SQL State:', error.sqlState);
            console.error('SQL Message:', error.sqlMessage);

            // Handle specific database errors
            switch (error.code) {
                case 'ER_NO_SUCH_TABLE':
                    return res.status(500).json({
                        success: false,
                        message: 'Database schema error. Please contact support.',
                        error: 'Missing required database table'
                    });
                case 'ER_BAD_FIELD_ERROR':
                    return res.status(500).json({
                        success: false,
                        message: 'Database schema error. Please contact support.',
                        error: 'Invalid database field'
                    });
                default:
                    return res.status(500).json({
                        success: false,
                        message: 'Database error occurred',
                        error: error.sqlMessage || error.message
                    });
            }
        }

        // Handle other types of errors
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Test route to check database state
router.get('/debug/poll/:id', auth, async (req, res) => {
    try {
        console.log('Debug: Checking poll ID:', req.params.id);
        
        // Check polls table
        const [pollData] = await db.query('SELECT * FROM polls WHERE id = ?', [req.params.id]);
        console.log('Debug: Poll data:', pollData);

        // Check questions
        const [questions] = await db.query('SELECT * FROM poll_questions WHERE poll_id = ?', [req.params.id]);
        console.log('Debug: Questions:', questions);

        // Check options and votes
        const questionIds = questions.map(q => q.id);
        if (questionIds.length > 0) {
            const [options] = await db.query(
                'SELECT * FROM poll_options WHERE question_id IN (?)',
                [questionIds]
            );
            console.log('Debug: Options:', options);

            const optionIds = options.map(o => o.id);
            if (optionIds.length > 0) {
                const [votes] = await db.query(
                    'SELECT * FROM votes WHERE option_id IN (?)',
                    [optionIds]
                );
                console.log('Debug: Votes:', votes);
            }
        }

        res.json({
            poll: pollData[0] || null,
            questions: questions,
            message: 'Check server logs for detailed debug info'
        });
    } catch (error) {
        console.error('Debug route error:', error);
        res.status(500).json({ 
            message: 'Debug route error',
            error: error.message
        });
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
