// Shroud client — OpenAI-compatible LLM proxy running inside a TEE (step 3).
// Per docs.1claw.xyz: the request/response body is OpenAI-shaped, but auth is via
// the X-Shroud-Agent-Key header and the upstream provider is picked with
// X-Shroud-Provider. claude-* model names route to the Anthropic provider.

import OpenAI from 'openai';
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../util/timeout.js';
import * as log from '../logger.js';
import type { Config } from '../config.js';

// Canned output used when no SHROUD_API_KEY is set, so the scaffold runs offline.
const CANNED_MCP_SERVER = `import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'get-time-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get-time',
      description: 'Returns the current time as an ISO 8601 timestamp.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'get-time') {
    throw new Error(\`unknown tool: \${request.params.name}\`);
  }
  return { content: [{ type: 'text', text: new Date().toISOString() }] };
});

await server.connect(new StdioServerTransport());
`;

// Shroud auto-detects the provider from the model name; mirror that here.
function providerFor(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  return 'openai';
}

export async function generateCode(config: Config, prompt: string): Promise<string> {
  if (!config.SHROUD_API_KEY) {
    log.stub('shroud — no SHROUD_API_KEY, returning canned MCP server');
    return CANNED_MCP_SERVER;
  }

  const provider = config.SHROUD_PROVIDER || providerFor(config.SHROUD_MODEL);
  // TODO(spec): confirm whether the base URL keeps the /v1 suffix — docs give the
  // proxy host as https://shroud.1claw.xyz; the openai SDK posts to {baseURL}/chat/completions.
  const client = new OpenAI({
    baseURL: config.SHROUD_API_URL,
    apiKey: 'shroud', // unused: Shroud authenticates via X-Shroud-Agent-Key
    defaultHeaders: {
      'X-Shroud-Agent-Key': config.SHROUD_API_KEY,
      'X-Shroud-Provider': provider,
    },
  });

  return withTimeout('shroud chat completion', DEFAULT_TIMEOUT_MS, async (signal) => {
    const res = await client.chat.completions.create(
      {
        model: config.SHROUD_MODEL,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal },
    );
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error('[step 3] shroud returned empty content');
    return content;
  });
}
