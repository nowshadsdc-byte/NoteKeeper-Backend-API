import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import console from "node:console";
import process from "node:process";
import { Types } from "mongoose";
import app from "../src/app.ts";
import { createAccessToken } from "../src/config/jwt.ts";
import Note from "../src/models/note.model.ts";

process.env.JWT_SECRET = "note-api-test-secret-that-is-long-enough";

const ownerId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();
const noteId = new Types.ObjectId().toString();
const ownerToken = createAccessToken(ownerId, "user");
const otherUserToken = createAccessToken(otherUserId, "user");
const ownerAdminToken = createAccessToken(ownerId, "admin");
const otherAdminToken = createAccessToken(otherUserId, "admin");

let server;
let baseUrl;
let note;
let noteExists;
let listRecords;
let totalNotes;
let databaseFailure;
const originalDescriptors = new Map();
let updateFilter;
let updateDocument;
let updateOptions;
let listQueryOptions;

const installModelStub = (name, value) => {
  if (!originalDescriptors.has(name)) {
    originalDescriptors.set(name, Object.getOwnPropertyDescriptor(Note, name));
  }

  Object.defineProperty(Note, name, {
    configurable: true,
    writable: true,
    value,
  });
};

const matchesOwner = (filter) =>
  filter._id.toString() === note._id.toString() &&
  filter.user.toString() === note.user.toString();

const installModelStubs = () => {
  installModelStub("findOne", (filter) => ({
    lean: async () => {
      if (databaseFailure) {
        throw new Error("database failure");
      }

      return noteExists && matchesOwner(filter) ? { ...note } : null;
    },
  }));
  installModelStub("findOneAndUpdate", (filter, update, options) => ({
    lean: async () => {
      updateFilter = filter;
      updateDocument = update;
      updateOptions = options;
      if (databaseFailure) {
        throw new Error("database failure");
      }
      if (!noteExists || !matchesOwner(filter)) {
        return null;
      }

      Object.assign(note, update.$set);
      return { ...note };
    },
  }));
  installModelStub("findOneAndDelete", (filter) => ({
    lean: async () => {
      if (databaseFailure) {
        throw new Error("database failure");
      }

      return noteExists && matchesOwner(filter) ? { ...note } : null;
    },
  }));
  installModelStub("find", () => {
    const query = {
      populate(options) {
        listQueryOptions.populate = options;
        return this;
      },
      sort(options) {
        listQueryOptions.sort = options;
        return this;
      },
      skip(value) {
        listQueryOptions.skip = value;
        return this;
      },
      limit(value) {
        listQueryOptions.limit = value;
        return this;
      },
      lean: async () => {
        if (databaseFailure) {
          throw new Error("database failure");
        }

        return listRecords;
      },
    };
    return query;
  });
  installModelStub("countDocuments", async () => {
    if (databaseFailure) {
      throw new Error("database failure");
    }

    return totalNotes;
  });
};

const request = (path, { token, method = "GET", body } = {}) => {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  return globalThis.fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  installModelStubs();
});

beforeEach(() => {
  noteExists = true;
  note = {
    _id: new Types.ObjectId(noteId),
    title: "Original title",
    content: "Original content",
    user: new Types.ObjectId(ownerId),
    createdAt: new Date("2026-11-15T10:00:00.000Z"),
    updatedAt: new Date("2026-11-15T10:00:00.000Z"),
  };
  listRecords = [
    {
      ...note,
      user: {
        _id: new Types.ObjectId(ownerId),
        name: "Note Owner",
        email: "owner@example.com",
      },
    },
  ];
  totalNotes = 25;
  databaseFailure = false;
  updateFilter = undefined;
  updateDocument = undefined;
  updateOptions = undefined;
  listQueryOptions = {};
});

after(async () => {
  for (const [name, descriptor] of originalDescriptors) {
    if (descriptor) {
      Object.defineProperty(Note, name, descriptor);
    } else {
      delete Note[name];
    }
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("owner and admin can read only their own notes", async () => {
  assert.equal((await request(`/api/notes/${noteId}`, { token: ownerToken })).status, 200);
  assert.equal((await request(`/api/notes/${noteId}`, { token: ownerAdminToken })).status, 200);
  assert.equal((await request(`/api/notes/${noteId}`, { token: otherUserToken })).status, 404);
  assert.equal((await request(`/api/notes/${noteId}`, { token: otherAdminToken })).status, 404);
  noteExists = false;
  assert.equal((await request(`/api/notes/${noteId}`, { token: ownerToken })).status, 404);
  assert.equal((await request("/api/notes/not-an-object-id", { token: ownerToken })).status, 400);
  assert.equal((await request(`/api/notes/${noteId}`)).status, 401);
});

test("owner updates supported fields without changing protected fields", async () => {
  const response = await request(`/api/notes/${noteId}`, {
    token: ownerToken,
    method: "PUT",
    body: {
      title: "  Updated title  ",
      content: " Updated content ",
      user: otherUserId,
      _id: otherUserId,
      createdAt: "2000-01-01T00:00:00.000Z",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(note.title, "Updated title");
  assert.equal(note.content, "Updated content");
  assert.equal(note.user.toString(), ownerId);
  assert.deepEqual(Object.keys(updateDocument.$set).sort(), ["content", "title"]);
  assert.deepEqual(updateFilter, { _id: noteId, user: ownerId });
  assert.deepEqual(updateOptions, { new: true, runValidators: true });

  assert.equal(
    (
      await request(`/api/notes/${noteId}`, {
        token: otherUserToken,
        method: "PUT",
        body: { title: "Unauthorized update" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/notes/${noteId}`, {
        token: otherAdminToken,
        method: "PUT",
        body: { title: "Unauthorized admin update" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/notes/${noteId}`, {
        token: ownerToken,
        method: "PUT",
        body: { title: "  " },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/notes/${noteId}`, {
        token: ownerToken,
        method: "PUT",
        body: { content: "\t " },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/notes/${noteId}`, {
        token: ownerToken,
        method: "PUT",
        body: { user: otherUserId },
      })
    ).status,
    400,
  );
});

test("only the note owner can delete a note", async () => {
  assert.equal(
    (await request(`/api/notes/${noteId}`, { token: otherUserToken, method: "DELETE" })).status,
    404,
  );
  assert.equal(
    (await request(`/api/notes/${noteId}`, { token: otherAdminToken, method: "DELETE" })).status,
    404,
  );
  const response = await request(`/api/notes/${noteId}`, {
    token: ownerToken,
    method: "DELETE",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, "Note deleted successfully");
});

test("admin can update and delete only their own notes", async () => {
  assert.equal(
    (
      await request(`/api/notes/${noteId}`, {
        token: ownerAdminToken,
        method: "PUT",
        body: { title: "Admin-owned note" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/notes/${noteId}`, {
        token: otherAdminToken,
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/notes/${noteId}`, {
        token: ownerAdminToken,
        method: "DELETE",
      })
    ).status,
    200,
  );
});

test("admin can list notes with safe owner data and pagination", async () => {
  const response = await request("/api/admin/notes?page=2&limit=5", {
    token: ownerAdminToken,
  });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.message, "Notes retrieved successfully");
  assert.deepEqual(body.pagination, {
    page: 2,
    limit: 5,
    total: 25,
    totalPages: 5,
  });
  assert.equal(body.data.length, 1);
  assert.deepEqual(Object.keys(body.data[0].user).sort(), ["_id", "email", "name"]);
  assert.deepEqual(listQueryOptions.populate, {
    path: "user",
    select: "name email",
  });
  assert.deepEqual(listQueryOptions.sort, { createdAt: -1, _id: -1 });
  assert.equal(listQueryOptions.skip, 5);
  assert.equal(listQueryOptions.limit, 5);

  assert.equal((await request("/api/admin/notes", { token: ownerToken })).status, 403);
  assert.equal((await request("/api/admin/notes")).status, 401);
  assert.equal((await request("/api/admin/notes", { token: "invalid-token" })).status, 401);
});

test("admin listing rejects invalid pagination and database failures return 500", async () => {
  for (const query of ["?page=0", "?page=1.5", "?limit=101", "?page=1&page=2"]) {
    assert.equal(
      (await request(`/api/admin/notes${query}`, { token: ownerAdminToken })).status,
      400,
      query,
    );
  }

  databaseFailure = true;
  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args);
  try {
    assert.equal(
      (await request(`/api/notes/${noteId}`, { token: ownerToken })).status,
      500,
    );
    assert.equal((await request("/api/admin/notes", { token: ownerAdminToken })).status, 500);
    assert.equal(loggedErrors.length, 2);
  } finally {
    console.error = originalConsoleError;
  }
});
