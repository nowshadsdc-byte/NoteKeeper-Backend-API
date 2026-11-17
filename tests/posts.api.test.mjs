import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import console from "node:console";
import process from "node:process";
import { Types } from "mongoose";
import app from "../src/app.ts";
import { createAccessToken } from "../src/config/jwt.ts";
import Post from "../src/models/Post.ts";

process.env.JWT_SECRET = "post-api-test-secret-that-is-long-enough";

const userId = new Types.ObjectId().toString();
const userToken = createAccessToken(userId, "user");
const originalCreateDescriptor = Object.getOwnPropertyDescriptor(
  Post,
  "create",
);

let server;
let baseUrl;
let createCalls;
let databaseFailure;

const request = (path, { token, body } = {}) => {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  return globalThis.fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  createCalls = [];
  databaseFailure = false;
  Object.defineProperty(Post, "create", {
    configurable: true,
    writable: true,
    value: async (post) => {
      createCalls.push(post);
      if (databaseFailure) {
        throw new Error("database failure");
      }

      return {
        _id: new Types.ObjectId(),
        ...post,
        createdAt: new Date("2026-11-17T10:00:00.000Z"),
        updatedAt: new Date("2026-11-17T10:00:00.000Z"),
      };
    },
  });
});

after(async () => {
  if (originalCreateDescriptor) {
    Object.defineProperty(Post, "create", originalCreateDescriptor);
  } else {
    delete Post.create;
  }

  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("authenticated users create posts owned by their account", async () => {
  const response = await request("/api/posts", {
    token: userToken,
    body: {
      title: "  My post  ",
      content: "  Post content  ",
      userId: new Types.ObjectId().toString(),
    },
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.message, "Post created successfully");
  assert.equal(body.data.title, "My post");
  assert.equal(body.data.content, "Post content");
  assert.equal(body.data.userId, userId);
  assert.equal(createCalls.length, 1);
  assert.deepEqual(Object.keys(createCalls[0]).sort(), [
    "content",
    "title",
    "userId",
  ]);
  assert.equal(createCalls[0].userId.toString(), userId);
});

test("post creation requires authentication and valid title/content", async () => {
  assert.equal(
    (await request("/api/posts", { body: { title: "Post", content: "Text" } }))
      .status,
    401,
  );
  assert.equal(
    (await request("/api/posts", { token: userToken, body: [] })).status,
    400,
  );
  assert.equal(
    (
      await request("/api/posts", {
        token: userToken,
        body: { title: " ", content: "Text" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/posts", {
        token: userToken,
        body: { title: "Post", content: " " },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/posts", {
        token: userToken,
        body: { title: "x".repeat(151), content: "Text" },
      })
    ).status,
    400,
  );
  assert.equal(createCalls.length, 0);
});

test("post creation forwards database failures to the error handler", async () => {
  databaseFailure = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await request("/api/posts", {
      token: userToken,
      body: { title: "Post", content: "Text" },
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      success: false,
      message: "Internal server error",
    });
  } finally {
    console.error = originalConsoleError;
  }
});
