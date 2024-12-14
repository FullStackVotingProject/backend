USE project_vote;

-- Clear existing data in the correct order (to avoid foreign key constraints)
DELETE FROM votes;
DELETE FROM polls;
DELETE FROM users;

-- Insert users with explicit IDs
INSERT INTO users (id, username, email, password, role, isVerified) VALUES
(1, 'admin', 'admin@admin.ma', '$2a$10$nxrd/5hgjFSPkC1JkQe01udb6bzpZvS0ShF9EYPhjZ4dVAvEXIDvS', 'admin', true),
(2, 'user1', 'user1@example.com', '$2a$10$nxrd/5hgjFSPkC1JkQe01udb6bzpZvS0ShF9EYPhjZ4dVAvEXIDvS', 'user', true),
(3, 'user2', 'user2@example.com', '$2a$10$nxrd/5hgjFSPkC1JkQe01udb6bzpZvS0ShF9EYPhjZ4dVAvEXIDvS', 'user', true);

-- Insert test polls with explicit IDs
INSERT INTO polls (id, question, option1, option2, option3, option4, end_time, created_by) VALUES
(1, 'What is your favorite programming language?', 'JavaScript', 'Python', 'Java', 'C++', 
 DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY), 1),
(2, 'Which framework do you prefer?', 'React', 'Angular', 'Vue', 'Svelte', 
 DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY), 1);

-- Insert test votes
INSERT INTO votes (poll_id, user_id, option_selected) VALUES
(1, 2, 1),  -- user1 votes for JavaScript in poll1
(1, 3, 2),  -- user2 votes for Python in poll1
(2, 2, 1),  -- user1 votes for React in poll2
(2, 3, 3);  -- user2 votes for Vue in poll2

-- Reset auto-increment values
ALTER TABLE users AUTO_INCREMENT = 4;
ALTER TABLE polls AUTO_INCREMENT = 3;
