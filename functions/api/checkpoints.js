/**
 * GET /api/checkpoints — 获取巡检点列表
 */
import {
  handleOptions, CORS_HEADERS,
  getAccessToken, getCheckpoints
} from '../_lib/feishu.js';

export async function onRequest(context) {
  const { request, env } = context;

  const optionsResp = handleOptions(request);
  if (optionsResp) return optionsResp;

  try {
    const accessToken = await getAccessToken(env);
    const checkpoints = await getCheckpoints(accessToken, env);

    const checkpointList = Object.entries(checkpoints).map(([uid, data]) => ({
      uid,
      ...data
    }));

    return new Response(JSON.stringify({
      success: true,
      data: checkpointList
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });

  } catch (error) {
    console.error('获取巡检点配置失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  }
}
