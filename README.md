# NoteKeeper Backend API

A REST API built with Node.js, Express, TypeScript, MongoDB, and Mongoose. It provides user registration and authentication, user and post endpoints, and note management.

## Requirements

- Node.js and npm
- MongoDB (local or hosted)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set your values:

   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/test
   JWT_SECRET=replace-with-a-random-secret-of-at-least-32-bytes
   ```

   `JWT_SECRET` must be at least 32 bytes. Keep `.env` private and do not commit real credentials.

3. Start the development server:

   ```bash
   npm run dev
   ```

   The default base URL is `http://localhost:5000`. Set `PORT` to use a different port.

## Common commands

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Run the TypeScript server in watch mode |
| `npm run build`     | Compile TypeScript into `dist/`         |
| `npm start`         | Run the compiled server                 |
| `npm test`          | Run API tests                           |
| `npm run typecheck` | Type-check without emitting files       |
| `npm run lint`      | Run ESLint                              |

## Authentication

Protected endpoints require a JWT access token in the `Authorization` header:

```http
Authorization: Bearer <accessToken>
```

Tokens are returned by `POST /api/auth/login` and expire after 15 minutes. Registration creates a regular user; admin-only endpoints require an account whose role is `admin`.

## API endpoints

Use `http://localhost:5000` as the base URL in the examples below.

### Health and root

| Method | Endpoint      | Access | Feature                     |
| ------ | ------------- | ------ | --------------------------- |
| `GET`  | `/`           | Public | Basic API status            |
| `GET`  | `/api/health` | Public | Health status and timestamp |

Both return `200 OK` with a success message. `/api/health` also includes a timestamp.

### Authentication

#### `POST /api/auth/register`

Creates a regular user. `interests` is optional.

```json
{
  "name": "Alex",
  "email": "alex@example.com",
  "password": "password123",
  "interests": ["technology", "reading"]
}
```

- **201** — user created; password is not included in the response.
- **400** — invalid request, invalid email, missing required values, short password, or invalid `interests`.
- **409** — email is already registered.

#### `POST /api/auth/login`

Authenticates a user. This endpoint is rate-limited.

```json
{
  "email": "alex@example.com",
  "password": "password123"
}
```

- **200** — returns safe user details and `data.accessToken`.
- **400** — invalid email or missing/invalid credentials.
- **401** — email/password combination is incorrect.

### Users

All user endpoints use the `/api/users` prefix.

| Method | Endpoint                        | Access        | Feature                                       |
| ------ | ------------------------------- | ------------- | --------------------------------------------- |
| `GET`  | `/api/users/me`                 | Authenticated | Get the current user's profile                |
| `GET`  | `/api/users`                    | Admin         | List users with pagination                    |
| `GET`  | `/api/users/group-by-interests` | Admin         | Group users by interest using one aggregation |
| `GET`  | `/api/users/:id/posts`          | Authenticated | Get a user's posts using `$lookup`            |

#### `GET /api/users/me`

Returns the authenticated user's profile without their password.

- **200** — profile returned.
- **401** — missing or invalid token.
- **404** — authenticated user no longer exists.

#### `GET /api/users?page=1&limit=10`

Lists users. `page` defaults to `1`; `limit` defaults to `10` and may not exceed `100`.

- **200** — user list and pagination details.
- **400** — invalid pagination.
- **401** — missing or invalid token.
- **403** — caller is not an admin.

#### `GET /api/users/group-by-interests`

Returns interest groups with each group's users and total user count. Users with missing or empty interests are grouped under `"No interests"`. It uses one MongoDB aggregation and excludes passwords.

- **200** — interest groups returned.
- **401** — missing or invalid token.
- **403** — caller is not an admin.

#### `GET /api/users/:id/posts?page=1&limit=10`

Returns the selected user's safe profile details and their posts. It uses a single aggregation with `$lookup`; posts are sorted newest first. Pagination defaults to page `1` and limit `10` (maximum `100`).

- **200** — user and paginated posts returned; a user with no posts gets an empty `posts` array.
- **400** — invalid MongoDB user ID or pagination.
- **401** — missing or invalid token.
- **404** — user does not exist.

Example response:

```json
{
  "success": true,
  "message": "User posts retrieved successfully",
  "data": {
    "user": {
      "_id": "64f000000000000000000001",
      "name": "Alex",
      "email": "alex@example.com"
    },
    "posts": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

### Posts

| Method | Endpoint     | Access        | Feature                                       |
| ------ | ------------ | ------------- | --------------------------------------------- |
| `POST` | `/api/posts` | Authenticated | Create a post owned by the authenticated user |

#### `POST /api/posts`

Creates a post in the separate `posts` collection. The server sets `userId` from the access token; do not send an owner ID in the body.

```json
{
  "title": "My first post",
  "content": "This is my post."
}
```

- **201** — post created, including its `userId` and timestamps.
- **400** — body must be a JSON object with non-empty string `title` and `content`; title is limited to 150 characters.
- **401** — missing or invalid token.

### Notes

All note endpoints require authentication. Note reads, updates, and deletes are scoped to the authenticated user's own notes.

| Method   | Endpoint                           | Access        | Feature                                                     |
| -------- | ---------------------------------- | ------------- | ----------------------------------------------------------- |
| `GET`    | `/api/notes`                       | Authenticated | Basic notes response (currently does not list note records) |
| `POST`   | `/api/notes`                       | Authenticated | Create a note                                               |
| `GET`    | `/api/notes/:id`                   | Authenticated | Retrieve an owned note                                      |
| `PUT`    | `/api/notes/:id`                   | Authenticated | Update an owned note                                        |
| `DELETE` | `/api/notes/:id`                   | Authenticated | Delete an owned note                                        |
| `GET`    | `/api/admin/notes?page=1&limit=10` | Admin         | List notes with owner details and pagination                |

#### `POST /api/notes`

Creates a note owned by the authenticated user.

```json
{
  "title": "Shopping list",
  "content": "Milk, bread, and coffee."
}
```

- **201** — note created.
- **400** — title or content is missing/empty, or title exceeds 150 characters.
- **401** — missing or invalid token.

#### `GET /api/notes/:id`

Returns the note only if it belongs to the authenticated user.

- **200** — note returned.
- **400** — invalid note ID.
- **401** — missing or invalid token.
- **404** — note not found or not owned by the caller.

#### `PUT /api/notes/:id`

Updates one or both of `title` and `content` for an owned note. Other fields are not editable through this endpoint.

```json
{
  "title": "Updated title",
  "content": "Updated note content."
}
```

- **200** — note updated.
- **400** — invalid ID/body, no editable fields, blank values, or title over 150 characters.
- **401** — missing or invalid token.
- **404** — note not found or not owned by the caller.

#### `DELETE /api/notes/:id`

Deletes an owned note.

- **200** — note deleted.
- **400** — invalid note ID.
- **401** — missing or invalid token.
- **404** — note not found or not owned by the caller.

#### `GET /api/admin/notes?page=1&limit=10`

Lists notes with safe owner details. `page` defaults to `1`; `limit` defaults to `10` and may not exceed `100`.

- **200** — notes and pagination returned.
- **400** — invalid pagination.
- **401** — missing or invalid token.
- **403** — caller is not an admin.

### Error responses

Unexpected server/database errors are handled by the global error handler and return `500`:

```json
{
  "success": false,
  "message": "Internal server error"
}
```

## Postman quick start

1. Register with `POST /api/auth/register` if you do not have an account.
2. Log in with `POST /api/auth/login`; copy `data.accessToken`.
3. Send `POST /api/posts` with **Authorization → Bearer Token** set to that token and the title/content JSON body above.
4. To view posts for a user, send `GET /api/users/<USER_ID>/posts?page=1&limit=10` with the same bearer token.

## Project structure

```text
.
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   ├── database.ts
│   │   └── jwt.ts
│   ├── controllers/
│   │   ├── notes.controller.ts
│   │   ├── posts.controller.ts
│   │   └── user.controller.ts
│   ├── middleware/
│   │   ├── admin.ts
│   │   ├── auth.ts
│   │   └── loginRateLimit.ts
│   ├── models/
│   │   ├── Post.ts
│   │   ├── User.ts
│   │   └── note.model.ts
│   ├── routes/
│   │   ├── admin.note.routes.ts
│   │   ├── note.route.ts
│   │   ├── posts.routes.ts
│   │   ├── profile.routes.ts
│   │   └── user.routes.ts
│   ├── services/
│   │   ├── note.service.ts
│   │   ├── post.service.ts
│   │   └── user.service.ts
│   ├── types/
│   │   ├── express.d.ts
│   │   ├── UserRole.ts
│   │   └── userModel.ts
│   └── utils/
├── tests/
│   ├── notes.api.test.mjs
│   ├── posts.api.test.mjs
│   └── users.aggregation.api.test.mjs
├── .env.example
├── eslint.config.js
├── package.json
├── test-mongo.js
└── tsconfig.json
```

### Main code areas

- **Routes** map HTTP paths to middleware and controllers.
- **Controllers** validate request input and format HTTP responses.
- **Services** perform database operations.
- **Models** define MongoDB document schemas and indexes. Posts are stored in the `posts` collection and reference users through `userId`.
- **Middleware** handles authentication, admin authorization, and login rate limiting.
- **Tests** exercise API behavior, including authentication, validation, aggregation, and post creation.
