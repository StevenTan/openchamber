import { sendBridgeMessage } from './bridge';

export const jsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};

export const unsupportedWebRouteResponse = (feature: string): Response => {
  return jsonResponse({ error: `${feature} is not supported in VS Code` }, 501);
};

export const bridgeJsonRoute = async (bridgeType: string, payload: unknown): Promise<Response> => {
  try {
    return jsonResponse(await sendBridgeMessage(bridgeType, payload), 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return jsonResponse({ error: message }, /must be|is required|session id/.test(message) ? 400 : 500);
  }
};
