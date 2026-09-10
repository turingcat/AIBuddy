import {
  client,
  methods,
  type Client,
  type ClientConnection,
  type Stream,
} from '@agentclientprotocol/sdk';
import {
  AIBUDDY_EXT_AGENT_REQUESTS,
  AIBUDDY_EXT_NOTIFICATIONS,
  AIBuddyExtClient,
  type AIBuddySessionNotification_unstable,
  type ProviderDeviceCodeNotification_unstable,
  type RecipeParamsResponse_unstable,
  type RequestRecipeParams_unstable,
  zAIBuddySessionNotification_unstable,
  zProviderDeviceCodeNotification_unstable,
  zRequestRecipeParams_unstable,
} from '@aibuddy/aibuddy-acp-client';

const [aibuddySessionUpdate, providerDeviceCode] = AIBUDDY_EXT_NOTIFICATIONS;
const [aibuddyRecipeParamsRequest] = AIBUDDY_EXT_AGENT_REQUESTS;

export type AIBuddyAcpCallbacks = Required<
  Pick<Client, 'requestPermission' | 'sessionUpdate' | 'unstable_createElicitation'>
> & {
  unstable_sessionRecipeRequestParams: (
    request: RequestRecipeParams_unstable
  ) => Promise<RecipeParamsResponse_unstable>;
  unstable_sessionUpdate: (notification: AIBuddySessionNotification_unstable) => Promise<void>;
  unstable_providerDeviceCode: (
    notification: ProviderDeviceCodeNotification_unstable
  ) => Promise<void>;
};

export type AIBuddyAcpClient = {
  connection: ClientConnection;
  aibuddy: AIBuddyExtClient;
};

export function connectAIBuddyAcpClient(
  stream: Stream,
  callbacks: AIBuddyAcpCallbacks
): AIBuddyAcpClient {
  const app = client({ name: 'aibuddy' })
    .onRequest(methods.client.session.requestPermission, (context) =>
      callbacks.requestPermission(context.params)
    )
    .onNotification(methods.client.session.update, (context) =>
      callbacks.sessionUpdate(context.params)
    )
    .onRequest(methods.client.elicitation.create, (context) =>
      callbacks.unstable_createElicitation(context.params)
    )
    .onRequest(aibuddyRecipeParamsRequest.method, zRequestRecipeParams_unstable, (context) =>
      callbacks.unstable_sessionRecipeRequestParams(context.params)
    )
    .onNotification(aibuddySessionUpdate.method, zAIBuddySessionNotification_unstable, (context) =>
      callbacks.unstable_sessionUpdate(context.params)
    )
    .onNotification(
      providerDeviceCode.method,
      zProviderDeviceCodeNotification_unstable,
      (context) => callbacks.unstable_providerDeviceCode(context.params)
    );

  const connection = app.connect(stream);
  const aibuddy = new AIBuddyExtClient(connection.agent);

  return { connection, aibuddy };
}
