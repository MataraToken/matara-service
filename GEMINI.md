## Matara Service

This is a Node.js application written in TypeScript that provides a backend service for a gamified application. The service includes features such as user management, a points system, tasks, milestones, boosts, and a daily bonus system. It also includes a Telegram bot for user interaction and uses WebSockets for real-time updates.

### Features

**User Management:**

*   **Registration:** New users can register with a username, referral code, premium status, profile picture, and first name.
*   **Referral System:** Users have referral codes. When a new user registers with a referral code, the referring user gets points.
*   **User Data:** The application stores user information, including username, profile picture, premium status, and onboarding status.
*   **Leaderboard:** The application provides a leaderboard of the top 50 users with the highest points.
*   **Onboarding:** The application tracks whether a user has completed the onboarding process.

**Points System:**

*   **Points:** Users can earn points through various activities.
*   **Initial Points:** New users start with a set number of points.
*   **Point Management:** The application can add points to a user's account.

**Tasks:**

*   **Task Creation:** Administrators can create tasks with a title, description, points, and a link.
*   **Task Completion:** Users can complete tasks to earn points.
*   **Task Management:** The application can retrieve, update, and delete tasks.

**Milestones:**

*   **Milestone Creation:** Administrators can create milestones with a count and points.
*   **Milestone Completion:** Users can complete milestones to earn points.
*   **Milestone Tracking:** The application tracks which milestones a user has completed.

**Boosts:**

*   **Boost Creation:** Administrators can create boosts with a count and points.
*   **Boost Purchase:** Users can purchase boosts.
*   **Boost Tracking:** The application tracks which boosts a user has purchased.

**Bonuses:**

*   **Daily Bonus:** Users can collect a daily bonus.
*   **Login Streak:** The application tracks a user's login streak and awards bonuses accordingly.

**Telegram Bot:**

*   The application includes a Telegram bot that can be used to interact with the service.

**Real-time Updates:**

*   The application uses WebSockets to provide real-time updates to clients.

### Technologies

*   **Node.js:** A JavaScript runtime environment.
*   **Express:** A web framework for Node.js.
*   **TypeScript:** A typed superset of JavaScript.
*   **MongoDB:** A NoSQL database.
*   **Mongoose:** An ODM for MongoDB.
*   **Socket.io:** A library for real-time web applications.
*   **Telegraf:** A framework for creating Telegram bots.
*   **Cloudinary:** A cloud-based image and video management service.
*   **Multer:** A middleware for handling `multipart/form-data`.
*   **Axios:** A promise-based HTTP client for the browser and Node.js.
*   **Node-cron:** A tool for scheduling tasks in Node.js.

### Getting Started

1.  Install dependencies: `npm install`
2.  Build the project: `npm run build`
3.  Start the server: `npm start`

The server will start on port 4000.
