const db = require('../config/db');

class PollSessionService {
    constructor(io) {
        this.io = io;
        this.activeTimers = new Map();
        this.initializeTimers();
    }

    async initializeTimers() {
        try {
            const [activePolls] = await db.query(`
                SELECT id, end_time 
                FROM polls 
                WHERE status = 'active' 
                AND end_time > NOW()`
            );

            activePolls.forEach(poll => {
                this.setPollTimer(poll.id, new Date(poll.end_time));
            });
        } catch (error) {
            console.error('Error initializing poll timers:', error);
        }
    }

    setPollTimer(pollId, endTime) {
        const now = new Date();
        const timeUntilEnd = endTime - now;

        if (timeUntilEnd <= 0) {
            this.endPollSession(pollId);
            return;
        }

        // Clear any existing timer
        if (this.activeTimers.has(pollId)) {
            clearTimeout(this.activeTimers.get(pollId));
        }

        // Set new timer
        const timer = setTimeout(() => this.endPollSession(pollId), timeUntilEnd);
        this.activeTimers.set(pollId, timer);
    }

    async endPollSession(pollId) {
        try {
            // Update poll status to ended
            await db.query(
                'UPDATE polls SET status = ? WHERE id = ?',
                ['ended', pollId]
            );

            // Clear the timer
            if (this.activeTimers.has(pollId)) {
                clearTimeout(this.activeTimers.get(pollId));
                this.activeTimers.delete(pollId);
            }

            // Get poll details for notification
            const [polls] = await db.query(
                'SELECT title FROM polls WHERE id = ?',
                [pollId]
            );

            if (polls.length > 0) {
                // Notify all connected clients
                this.io.emit('pollEnded', {
                    pollId,
                    title: polls[0].title,
                    message: `Le vote "${polls[0].title}" est maintenant terminé.`
                });
            }
        } catch (error) {
            console.error('Error ending poll session:', error);
        }
    }

    // Call this when a new poll is created
    addPollSession(pollId, endTime) {
        this.setPollTimer(pollId, new Date(endTime));
    }
}

module.exports = PollSessionService;
