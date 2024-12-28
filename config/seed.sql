
USE vote_db;

-- Clear existing data in the correct order (to avoid foreign key constraints)
DELETE FROM votes;
DELETE FROM poll_options;
DELETE FROM poll_questions;
DELETE FROM polls;
DELETE FROM users;

-- Insert sample users with hashed passwords
INSERT INTO users (username, password, email, role, isVerified) VALUES
('admin', '$2a$10$JaCpmeAPWuFRWpZ8lX0SyOq8eU8CcpgD.b6f0K5n37HgGPPCjkJZG', 'admin@example.com', 'admin', true),
('user1', '$2a$10$WUUFKDlF5BV8ChsZ7bpSa.r.wQ0iPpQznDnEnWSF2Pxh0PgSbSNAW', 'user1@example.com', 'user', true);

-- Insert sample poll
INSERT INTO polls (title, description, start_time, duration_minutes, end_time, status, created_by) VALUES
('Employee Satisfaction Survey', 'Help us improve our workplace!', 
 CURRENT_TIMESTAMP, 1440, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 DAY), 'active', 1);

-- Insert sample questions
INSERT INTO poll_questions (poll_id, question_text, question_order) VALUES
(1, 'How satisfied are you with your work environment?', 1),
(1, 'How would you rate the company culture?', 2);

-- Insert sample options
INSERT INTO poll_options (question_id, option_text, option_order) VALUES
(1, 'Very Satisfied', 1),
(1, 'Satisfied', 2),
(1, 'Neutral', 3),
(1, 'Dissatisfied', 4),
(2, 'Excellent', 1),
(2, 'Good', 2),
(2, 'Fair', 3),
(2, 'Poor', 4);

-- Reset auto-increment values
ALTER TABLE users AUTO_INCREMENT = 3;
ALTER TABLE polls AUTO_INCREMENT = 2;
ALTER TABLE poll_questions AUTO_INCREMENT = 3;
ALTER TABLE poll_options AUTO_INCREMENT = 9;
