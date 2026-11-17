import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import console from "node:console";
import process from "node:process";
import { Types } from "mongoose";
import app from "../src/app.ts";
import { createAccessToken } from "../src/config/jwt.ts";
import Post from "../src/models/Post.ts";
import { UserModel } from "../src/models/User.ts";

process.env.JWT_SECRET = "user-aggregation-test-secret-that-is-long-enough";

const userId = new Types.ObjectId().toString();
const adminToken = createAccessToken(new Types.ObjectId().toString(), "admin");
const userToken = createAccessToken(new Types.ObjectId().toString(), "user");

let server;
let baseUrl;
let aggregateCalls;
let aggregateResult;
let aggregateFailure;
const originalDescriptors = new Map();

const setModelMethod = (name, value) => {
  if (!originalDescriptors.has(name)) {
    originalDescriptors.set(
      name,
      Object.getOwnPropertyDescriptor(UserModel, name),
    );
  }
  Object.defineProperty(UserModel, name, {
    configurable: true,
    writable: true,
    value,
  });
};

const request = (path, token) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return globalThis.fetch(`${baseUrl}${path}`, { headers });
};

const restoreModelMethods = () => {
  for (const [name, descriptor] of originalDescriptors) {
    if (descriptor) {
      Object.defineProperty(UserModel, name, descriptor);
    } else {
      delete UserModel[name];
    }
  }
};

before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  aggregateCalls = [];
  aggregateResult = [];
  aggregateFailure = false;

  setModelMethod("aggregate", (pipeline) => {
    aggregateCalls.push(pipeline);
    return {
      exec: async () => {
        if (aggregateFailure) {
          throw new Error("database failure");
        }
        return aggregateResult;
      },
    };
  });

  for (const method of ["find", "findById", "findOne", "countDocuments"]) {
    setModelMethod(method, () => {
      throw new Error(`${method} must not be used by aggregation endpoints`);
    });
  }
});

after(async () => {
  restoreModelMethods();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("admin gets interest groups from one safe aggregation", async () => {
  aggregateResult = [
    {
      interest: "AI",
      users: [{ _id: new Types.ObjectId(userId), name: "Alex", email: "alex@example.com", role: "user" }],
      totalUsers: 1,
    },
    {
      interest: "No interests",
      users: [{ _id: new Types.ObjectId(), name: "Sam", email: "sam@example.com", role: "user" }],
      totalUsers: 1,
    },
  ];

  const response = await request("/api/users/group-by-interests", adminToken);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.message, "Users grouped by interests");
  assert.equal(body.data.length, 2);
  assert.equal(body.data[1].interest, "No interests");
  assert.equal(Object.hasOwn(body.data[0].users[0], "password"), false);
  assert.equal(aggregateCalls.length, 1);
  const pipeline = aggregateCalls[0];
  assert.equal(pipeline.some((stage) => "$unwind" in stage && stage.$unwind.preserveNullAndEmptyArrays), true);
  assert.equal(pipeline.filter((stage) => "$group" in stage).length, 2);
  assert.equal(pipeline.some((stage) => "$sort" in stage), true);
  assert.equal(Object.hasOwn(pipeline[0].$project, "password"), false);
});

test("only admins can run the interest aggregation", async () => {
  assert.equal((await request("/api/users/group-by-interests", userToken)).status, 403);
  assert.equal((await request("/api/users/group-by-interests")).status, 401);
  assert.equal(aggregateCalls.length, 0);
});

test("Post schema uses the posts collection and owner/date index", () => {
  assert.equal(Post.collection.name, "posts");
  const indexes = Post.schema.indexes().map(([keys]) => keys);
  assert.equal(
    indexes.some(
      (keys) =>
        keys.userId === 1 &&
        keys.createdAt === -1 &&
        keys._id === -1 &&
        Object.keys(keys).length === 3,
    ),
    true,
  );
});

test("user posts use one paginated lookup aggregation with safe projections", async () => {
  aggregateResult = [
    {
      user: {
        _id: new Types.ObjectId(userId),
        name: "Alex",
        email: "alex@example.com",
      },
      posts: [
        {
          _id: new Types.ObjectId(),
          title: "Latest post",
          content: "Text",
          userId: new Types.ObjectId(userId),
          createdAt: new Date("2026-11-17T10:00:00.000Z"),
          updatedAt: new Date("2026-11-17T10:00:00.000Z"),
        },
      ],
      totalPosts: 5,
    },
  ];

  const response = await request(
    `/api/users/${userId}/posts?page=2&limit=2`,
    userToken,
  );
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.data.user.email, "alex@example.com");
  assert.equal(body.data.posts.length, 1);
  assert.deepEqual(body.data.pagination, {
    page: 2,
    limit: 2,
    total: 5,
    totalPages: 3,
  });
  assert.equal(Object.hasOwn(body.data.user, "password"), false);
  assert.equal(aggregateCalls.length, 1);

  const pipeline = aggregateCalls[0];
  assert.equal(pipeline[0].$match._id.toString(), userId);
  const lookup = pipeline.find((stage) => "$lookup" in stage).$lookup;
  assert.equal(lookup.from, "posts");
  assert.equal(lookup.let.userId, "$_id");
  const facet = lookup.pipeline.find((stage) => "$facet" in stage).$facet;
  assert.deepEqual(facet.posts.slice(0, 3), [
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: 2 },
    { $limit: 2 },
  ]);
  assert.deepEqual(facet.total, [{ $count: "count" }]);
  assert.equal(
    facet.posts.some((stage) => "$project" in stage && "password" in stage.$project),
    false,
  );
});

test("user posts validate ID and pagination and return 404 for missing users", async () => {
  assert.equal((await request("/api/users/not-an-object-id/posts", userToken)).status, 400);
  assert.equal((await request(`/api/users/${userId}/posts`)).status, 401);
  assert.equal((await request(`/api/users/${userId}/posts`, "invalid-token")).status, 401);
  assert.equal((await request(`/api/users/${userId}/posts?page=0`, userToken)).status, 400);
  assert.equal((await request(`/api/users/${userId}/posts?limit=101`, userToken)).status, 400);
  assert.equal(aggregateCalls.length, 0);

  aggregateResult = [];
  assert.equal((await request(`/api/users/${userId}/posts`, userToken)).status, 404);
  assert.equal(aggregateCalls.length, 1);
});

test("existing users with no posts return an empty list and database failures return 500", async () => {
  aggregateResult = [
    {
      user: {
        _id: new Types.ObjectId(userId),
        name: "Alex",
        email: "alex@example.com",
      },
      posts: [],
      totalPosts: 0,
    },
  ];
  const response = await request(`/api/users/${userId}/posts`, userToken);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.posts, []);
  assert.deepEqual(body.data.pagination, {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  aggregateFailure = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.equal((await request("/api/users/group-by-interests", adminToken)).status, 500);
  } finally {
    console.error = originalConsoleError;
  }
});
