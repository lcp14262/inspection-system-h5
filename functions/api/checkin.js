/**
 * POST /api/checkin — 提交打卡
 */
import {
  handleOptions, CORS_HEADERS,
  getAccessToken, getCheckpoints, calculateDistance,
  uploadPhoto, writeCheckinRecord, getConfig
} from '../_lib/feishu.js';

export async function onRequest(context) {
  const { request, env } = context;

  // 预检请求
  const optionsResp = handleOptions(request);
  if (optionsResp) return optionsResp;

  try {
    const body = await request.json();
    const { nfcUid, gps, photoBase64, userInfo, checkpointName } = body;

    // 1. 获取访问令牌
    const accessToken = await getAccessToken(env);

    // 2. 读取巡检点配置
    const checkpoints = await getCheckpoints(accessToken, env);
    const checkpoint = checkpoints[nfcUid];

    if (!checkpoint) {
      return new Response(JSON.stringify({
        success: false,
        message: '无效的 NFC 标签，请联系管理员'
      }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
    }

    // 3. GPS 距离校验
    const CONFIG = getConfig(env);
    const distance = calculateDistance(gps.lat, gps.lng, checkpoint.lat, checkpoint.lng);
    const threshold = checkpoint.threshold || CONFIG.GPS_THRESHOLD;
    const gpsValid = distance <= threshold;

    // 4. 上传照片
    let fileKey = null;
    if (CONFIG.ENABLE_PHOTO_UPLOAD && photoBase64) {
      const fileName = `checkin_${Date.now()}.jpg`;
      fileKey = await uploadPhoto(accessToken, photoBase64, fileName);
    }

    // 5. 准备记录数据
    const now = new Date().getTime();
    const record = {
      '打卡时间': now,
      '用户姓名': userInfo.name || '',
      '用户工号': userInfo.employee_no || '',
      '巡检点名称': checkpoint.name,
      'NFC 标签 UID': nfcUid,
      'GPS 坐标': `${gps.lat},${gps.lng}`,
      '现场照片': fileKey ? [{ file_key: fileKey }] : [],
      'GPS 校验结果': gpsValid ? '通过' : '异常',
      '打卡状态': gpsValid ? '成功' : '异常',
      '备注': gpsValid ? '' : `距离偏差${Math.round(distance)}米，超出阈值${threshold}米`
    };

    // 6. 写入多维表格
    await writeCheckinRecord(accessToken, record, env);

    // 7. 返回结果
    return new Response(JSON.stringify({
      success: true,
      message: '打卡成功',
      data: {
        checkpointName: checkpoint.name,
        gpsValid: gpsValid,
        distance: Math.round(distance),
        threshold: threshold
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });

  } catch (error) {
    console.error('打卡处理失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: `服务器错误：${error.message}`
    }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  }
}
