import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearAccountError: vi.fn(),
  extractApiKey: vi.fn(),
  getModelInfo: vi.fn(),
  getProviderCredentials: vi.fn(),
  getSettings: vi.fn(),
  handleEmbeddingsCore: vi.fn(),
  isValidApiKey: vi.fn(),
  markAccountUnavailable: vi.fn(),
  checkAndRefreshToken: vi.fn(),
  updateProviderCredentials: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
}));

vi.mock("@/sse/services/auth.js", () => ({
  clearAccountError: mocks.clearAccountError,
  extractApiKey: mocks.extractApiKey,
  getProviderCredentials: mocks.getProviderCredentials,
  isValidApiKey: mocks.isValidApiKey,
  markAccountUnavailable: mocks.markAccountUnavailable,
}));

vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: mocks.getModelInfo,
}));

vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: mocks.checkAndRefreshToken,
  updateProviderCredentials: mocks.updateProviderCredentials,
}));

vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  maskKey: vi.fn(() => "<masked>"),
  request: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../open-sse/handlers/embeddingsCore.js", () => ({
  handleEmbeddingsCore: mocks.handleEmbeddingsCore,
}));

import { handleEmbeddings } from "../../src/sse/handlers/embeddings.js";
import { OPTIONS, POST } from "../../src/app/api/v1/embeddings/route.js";

const MODEL = "openai/text-embedding-3-small";

function request(body, apiKey = null) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return new Request("http://localhost:21023/v1/embeddings", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function successResponse() {
  return new Response(JSON.stringify({
    object: "list",
    data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 1, total_tokens: 1 },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function credentials(id = "connection-1") {
  return {
    apiKey: "provider-key",
    connectionId: id,
    connectionName: id,
    providerSpecificData: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSettings.mockResolvedValue({ requireApiKey: false });
  mocks.extractApiKey.mockReturnValue(null);
  mocks.isValidApiKey.mockResolvedValue(true);
  mocks.getModelInfo.mockResolvedValue({
    provider: "openai",
    model: "text-embedding-3-small",
  });
  mocks.getProviderCredentials.mockResolvedValue(credentials());
  mocks.checkAndRefreshToken.mockImplementation(async (_provider, value) => value);
  mocks.markAccountUnavailable.mockResolvedValue({ shouldFallback: false, cooldownMs: 0 });
  mocks.handleEmbeddingsCore.mockResolvedValue({
    success: true,
    response: successResponse(),
  });
});

describe("/v1/embeddings route", () => {
  it("answers CORS preflight requests", async () => {
    const response = await OPTIONS();

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(await response.text()).toBe("");
  });

  it("delegates POST requests to the local embeddings handler", async () => {
    const response = await POST(request({ model: MODEL, input: "hello" }));

    expect(response.status).toBe(200);
    expect(mocks.handleEmbeddingsCore).toHaveBeenCalledOnce();
  });
});

describe("local embeddings handler validation and authentication", () => {
  it("rejects invalid JSON", async () => {
    const response = await handleEmbeddings(request("{ invalid"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/invalid json/i);
  });

  it("allows local requests without a key when key enforcement is disabled", async () => {
    const response = await handleEmbeddings(request({ model: MODEL, input: "hello" }));

    expect(response.status).toBe(200);
    expect(mocks.isValidApiKey).not.toHaveBeenCalled();
  });

  it("requires a key when enabled in database settings", async () => {
    mocks.getSettings.mockResolvedValue({ requireApiKey: true });

    const response = await handleEmbeddings(request({ model: MODEL, input: "hello" }));

    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toMatch(/missing api key/i);
  });

  it("rejects an invalid key when enforcement is enabled", async () => {
    mocks.getSettings.mockResolvedValue({ requireApiKey: true });
    mocks.extractApiKey.mockReturnValue("potluck-invalid");
    mocks.isValidApiKey.mockResolvedValue(false);

    const response = await handleEmbeddings(
      request({ model: MODEL, input: "hello" }, "potluck-invalid"),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toMatch(/invalid api key/i);
  });

  it("rejects missing model and input fields", async () => {
    const missingModel = await handleEmbeddings(request({ input: "hello" }));
    const missingInput = await handleEmbeddings(request({ model: MODEL }));

    expect(missingModel.status).toBe(400);
    expect((await missingModel.json()).error.message).toMatch(/missing model/i);
    expect(missingInput.status).toBe(400);
    expect((await missingInput.json()).error.message).toMatch(/missing required field: input/i);
  });

  it("rejects model names that do not resolve to a provider", async () => {
    mocks.getModelInfo.mockResolvedValue({ provider: null, model: null });

    const response = await handleEmbeddings(
      request({ model: "unknown-model", input: "hello" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/invalid model format/i);
  });
});

describe("local embeddings handler routing and fallback", () => {
  it("passes resolved model, credentials, and input to the core handler", async () => {
    const response = await handleEmbeddings(
      request({ model: MODEL, input: ["hello", "world"], dimensions: 256 }),
    );

    expect(response.status).toBe(200);
    const call = mocks.handleEmbeddingsCore.mock.calls[0][0];
    expect(call.body).toMatchObject({
      model: MODEL,
      input: ["hello", "world"],
      dimensions: 256,
    });
    expect(call.modelInfo).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
    });
    expect(call.credentials.connectionId).toBe("connection-1");
  });

  it("returns a clear error when the provider has no credentials", async () => {
    mocks.getProviderCredentials.mockResolvedValue(null);

    const response = await handleEmbeddings(request({ model: MODEL, input: "hello" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/no credentials for provider: openai/i);
  });

  it("tries the next account when the current account is unavailable", async () => {
    mocks.getProviderCredentials
      .mockResolvedValueOnce(credentials("connection-1"))
      .mockResolvedValueOnce(credentials("connection-2"));
    mocks.handleEmbeddingsCore
      .mockResolvedValueOnce({
        success: false,
        status: 429,
        error: "Rate limit exceeded",
        response: new Response("rate limited", { status: 429 }),
      })
      .mockResolvedValueOnce({
        success: true,
        response: successResponse(),
      });
    mocks.markAccountUnavailable.mockResolvedValueOnce({
      shouldFallback: true,
      cooldownMs: 60_000,
    });

    const response = await handleEmbeddings(request({ model: MODEL, input: "hello" }));

    expect(response.status).toBe(200);
    expect(mocks.handleEmbeddingsCore).toHaveBeenCalledTimes(2);
    expect(mocks.getProviderCredentials.mock.calls[1][1]).toEqual(
      new Set(["connection-1"]),
    );
  });

  it("returns Retry-After when all accounts are rate limited", async () => {
    mocks.getProviderCredentials.mockResolvedValue({
      allRateLimited: true,
      retryAfter: new Date(Date.now() + 60_000).toISOString(),
      retryAfterHuman: "reset after 60s",
      lastError: "Rate limit exceeded",
      lastErrorCode: 429,
    });

    const response = await handleEmbeddings(request({ model: MODEL, input: "hello" }));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await response.json()).error.message).toMatch(/rate limit exceeded/i);
  });

  it("propagates a non-fallback provider error", async () => {
    mocks.handleEmbeddingsCore.mockResolvedValue({
      success: false,
      status: 400,
      error: "Invalid embedding input",
      response: new Response(
        JSON.stringify({ error: { message: "Invalid embedding input" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    });

    const response = await handleEmbeddings(request({ model: MODEL, input: "hello" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("Invalid embedding input");
  });
});
