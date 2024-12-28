const { Pool } = require('pg');
const schedule = require('node-schedule');

class PollSessionService {
    constructor(io) {
        this.io = io;
        this.jobs = new Map();
        this.pool = new Pool(); // Utilise les variables d'environnement pour la configuration
    }

    // Initialise les timers pour tous les sondages actifs
    async initializeActivePollTimers() {
        try {
            const query = `
                SELECT id, title, end_time 
                FROM polls 
                WHERE status = 'active' 
                AND end_time > NOW()
            `;
            const { rows } = await this.pool.query(query);
            
            for (const poll of rows) {
                this.schedulePollEnd(poll);
            }
            
            console.log(`Initialized ${rows.length} poll timers`);
        } catch (error) {
            console.error('Error initializing poll timers:', error);
        }
    }

    // Programme la fin d'un sondage
    schedulePollEnd(poll) {
        if (this.jobs.has(poll.id)) {
            this.jobs.get(poll.id).cancel();
        }

        const job = schedule.scheduleJob(new Date(poll.end_time), async () => {
            try {
                await this.endPoll(poll.id, poll.title);
            } catch (error) {
                console.error(`Error ending poll ${poll.id}:`, error);
            }
        });

        this.jobs.set(poll.id, job);
        console.log(`Scheduled end for poll ${poll.id} at ${poll.end_time}`);
    }

    // Termine un sondage
    async endPoll(pollId, title) {
        try {
            // Mettre à jour le statut du sondage
            const query = `
                UPDATE polls 
                SET status = 'completed' 
                WHERE id = $1 
                AND status = 'active'
            `;
            await this.pool.query(query, [pollId]);

            // Émettre l'événement de fin de sondage
            this.io.emit('pollEnded', {
                pollId,
                title,
                message: `Le sondage "${title}" est terminé.`
            });

            // Nettoyer le job
            if (this.jobs.has(pollId)) {
                this.jobs.delete(pollId);
            }

            console.log(`Poll ${pollId} ended successfully`);
        } catch (error) {
            console.error(`Error ending poll ${pollId}:`, error);
            throw error;
        }
    }

    // Ajoute un nouveau sondage
    addPoll(poll) {
        if (poll.end_time) {
            this.schedulePollEnd(poll);
        }
    }

    // Nettoie les ressources
    cleanup() {
        for (const job of this.jobs.values()) {
            job.cancel();
        }
        this.jobs.clear();
    }
}

module.exports = PollSessionService;