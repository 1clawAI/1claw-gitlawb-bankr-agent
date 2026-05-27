// Shroud client — OpenAI-compatible LLM proxy running inside a TEE (step 3).
// Secrets in the prompt are redacted by the proxy; we just point the openai SDK
// at the Shroud base URL.

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

export async function generateCode(config: Config, prompt: string): Promise<string> {
  if (!config.SHROUD_API_KEY) {
    log.stub('shroud — no SHROUD_API_KEY, returning canned MCP server');
    return CANNED_MCP_SERVER;
  }

  // TODO(spec): confirm Shroud base URL and whether it accepts Anthropic model
  // names (claude-*) or only OpenAI model names. Defaulting to config.SHROUD_MODEL.
  const client = new OpenAI({ baseURL: config.SHROUD_API_URL, apiKey: config.SHROUD_API_KEY });

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
