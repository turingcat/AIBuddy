import {
  client,
  methods,
  type Client,
  type ClientConnection,
  type Stream,
} from '@agentclientprotocol/sdk';
import {
  HEYBUDDY_EXT_AGENT_REQUESTS,
  HEYBUDDY_EXT_NOTIFICATIONS,
  HeyBuddyExtClient,
  type HeyBuddySessionNotification_unstable,
  type ProviderDeviceCodeNotification_unstable,
  type RecipeParamsResponse_unstable,
  type RequestRecipeParams_unstable,
  zHeyBuddySessionNotification_unstable,
  zProviderDeviceCodeNotification_unstable,
  zRequestRecipeParams_unstable,
} from '@heybuddy/heybuddy-sdk';

const [heybuddySessionUpdate, providerDeviceCode] = HEYBUDDY_EXT_NOTIFICATIONS;
const [heybuddyRecipeParamsRequest] = HEYBUDDY_EXT_AGENT_REQUESTS;

export type HeyBuddyAcpCallbacks = Required<
  Pick<Client, 'requestPermission' | 'sessionUpdate' | 'unstable_createElicitation'>
> & {
  unstable_sessionRecipeRequestParams: (
    request: RequestRecipeParams_unstable
  ) => Promise<RecipeParamsResponse_unstable>;
  unstable_sessionUpdate: (notification: HeyBuddySessionNotification_unstable) => Promise<void>;
  unstable_providerDeviceCode: (
    notification: ProviderDeviceCodeNotification_unstable
  ) => Promise<void>;
};

export type HeyBuddyAcpClient = {
  connection: ClientConnection;
  heybuddy: HeyBuddyExtClient;
};

export function connectHeyBuddyAcpClient(
  stream: Stream,
  callbacks: HeyBuddyAcpCallbacks
): HeyBuddyAcpClient {
  const app = client({ name: 'heybuddy' })
    .onRequest(methods.client.session.requestPermission, (context) =>
      callbacks.requestPermission(context.params)
    )
    .onNotification(methods.client.session.update, (context) =>
      callbacks.sessionUpdate(context.params)
    )
    .onRequest(methods.client.elicitation.create, (context) =>
      callbacks.unstable_createElicitation(context.params)
    )
    .onRequest(heybuddyRecipeParamsRequest.method, zRequestRecipeParams_unstable, (context) =>
      callbacks.unstable_sessionRecipeRequestParams(context.params)
    )
    .onNotification(heybuddySessionUpdate.method, zHeyBuddySessionNotification_unstable, (context) =>
      callbacks.unstable_sessionUpdate(context.params)
    )
    .onNotification(
      providerDeviceCode.method,
      zProviderDeviceCodeNotification_unstable,
      (context) => callbacks.unstable_providerDeviceCode(context.params)
    );

  const connection = app.connect(stream);
  const heybuddy = new HeyBuddyExtClient(connection.agent);

  return { connection, heybuddy };
}
