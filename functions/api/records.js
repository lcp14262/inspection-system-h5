/**
 * GET /api/records — 查询打卡记录
 */
import {
  handleOptions, CORS_HEADERS,
  getAccessToken, queryCheckinRecords
} from '../_lib/feishu.js';

export async function onRequest(context) {
  const { request, env } = context;

  const optionsResp = handleOptions(request);
  if (optionsResp) return optionsResp;

  try {
    const url = new URL(request.url);
    const filters = {
      startDate: url.searchParams.get('startDate'),
      endDate: url.searchParams.get('endDate'),
      userName: url.searchParams.get('userName'),
      checkpointName: url.searchParams.get('checkpointName')
    };

    const accessToken = await getAccessToken(env);
    const records = await queryCheckinRecords(accessToken, filters, env);

    return new Response(JSON.stringify({
      success: true,
      data: records
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });

  } catch (error) {
    console.error('查询打卡记录失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  }
}
