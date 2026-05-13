/**
 * 飞书 API 共享工具库 - Cloudflare Pages Functions
 * 提供给 api/* 路由使用
 */

/**
 * 获取配置（从环境变量读取，带默认值）
 */
export function getConfig(env) {
  const BITABLE_APP_TOKEN = env.BITABLE_APP_TOKEN;
  const BITABLE_TABLE_ID = env.BITABLE_TABLE_ID;
  const CHECKPOINTS_TABLE_ID = env.CHECKPOINTS_TABLE_ID;
  const FEISHU_APP_ID = env.FEISHU_APP_ID;
  const FEISHU_APP_SECRET = env.FEISHU_APP_SECRET;
  
  // 检查必要的环境变量是否已配置
  if (!BITABLE_APP_TOKEN || !BITABLE_TABLE_ID || !CHECKPOINTS_TABLE_ID || !FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    console.error('❌ 缺少必要的环境变量配置，请在 Cloudflare Pages 设置中添加：');
    console.error('  - BITABLE_APP_TOKEN: 多维表格 Token');
    console.error('  - BITABLE_TABLE_ID: 打卡记录表 ID');
    console.error('  - CHECKPOINTS_TABLE_ID: 巡检点配置表 ID');
    console.error('  - FEISHU_APP_ID: 飞书应用 App ID');
    console.error('  - FEISHU_APP_SECRET: 飞书应用 App Secret');
    throw new Error('环境变量配置不完整');
  }
  
  return {
    BITABLE_APP_TOKEN,
    BITABLE_TABLE_ID,
    CHECKPOINTS_TABLE_ID,
    FEISHU_APP_ID,
    FEISHU_APP_SECRET,
    GPS_THRESHOLD: parseInt(env.GPS_THRESHOLD || '100'),
    ENABLE_PHOTO_UPLOAD: env.ENABLE_PHOTO_UPLOAD !== 'false',
    MAX_PHOTO_SIZE: parseInt(env.MAX_PHOTO_SIZE || '5') * 1024 * 1024
  };
}

/**
 * CORS 响应头
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',  // 生产环境建议限制为具体域名
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

/**
 * 处理 OPTIONS 预检请求
 */
export function handleOptions(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  return null;
}

/**
 * 获取访问令牌
 */
export async function getAccessToken(env) {
  const CONFIG = getConfig(env);
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: CONFIG.FEISHU_APP_ID,
      app_secret: CONFIG.FEISHU_APP_SECRET
    })
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取 access_token 失败：${data.msg}`);
  }
  return data.tenant_access_token;
}

/**
 * 上传照片到飞书云文档
 */
export async function uploadPhoto(accessToken, base64Image, fileName) {
  try {
    const imageBuffer = Uint8Array.from(atob(base64Image.replace(/^data:image\/\w+;base64,/, '')), c => c.charCodeAt(0));
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, fileName);

    const CONFIG = getConfig(accessToken);
    const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.BITABLE_APP_TOKEN}/upload_image`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
      body: formData
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`上传照片失败：${data.msg}`);
    }
    return data.data.file_key;
  } catch (error) {
    console.error('照片上传失败:', error);
    return null;
  }
}

/**
 * 计算两点间距离（Haversine 公式）
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 从多维表格读取巡检点配置
 */
export async function getCheckpoints(accessToken, env) {
  const CONFIG = getConfig(env);
  try {
    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.BITABLE_APP_TOKEN}/tables/${CONFIG.CHECKPOINTS_TABLE_ID}/records`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();
    if (data.code !== 0) {
      console.error('读取巡检点配置失败:', data.msg);
      return [];
    }

    const checkpoints = {};
    data.data.items.forEach(record => {
      const fields = record.fields;
      if (fields['启用状态']) {
        checkpoints[fields['NFC 标签 UID']] = {
          name: fields['巡检点名称'],
          lat: parseFloat(fields['GPS 纬度']),
          lng: parseFloat(fields['GPS 经度']),
          threshold: fields['偏差阈值'] || CONFIG.GPS_THRESHOLD
        };
      }
    });
    return checkpoints;
  } catch (error) {
    console.error('读取巡检点配置失败:', error);
    return {};
  }
}

/**
 * 写入打卡记录到多维表格
 */
export async function writeCheckinRecord(accessToken, record, env) {
  const CONFIG = getConfig(env);
  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.BITABLE_APP_TOKEN}/tables/${CONFIG.BITABLE_TABLE_ID}/records`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: record })
    }
  );

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`写入记录失败：${data.msg}`);
  }
  return data.data;
}

/**
 * 查询打卡记录
 */
export async function queryCheckinRecords(accessToken, filters = {}, env) {
  const CONFIG = getConfig(env);
  try {
    const { startDate, endDate, userName, checkpointName } = filters;
    const filterConditions = [];

    if (startDate) {
      filterConditions.push({
        field_name: '打卡时间',
        operator: 'isGreaterEqual',
        value: [new Date(startDate).getTime().toString()]
      });
    }
    if (endDate) {
      filterConditions.push({
        field_name: '打卡时间',
        operator: 'isLessEqual',
        value: [new Date(endDate).getTime().toString()]
      });
    }
    if (userName) {
      filterConditions.push({
        field_name: '用户姓名',
        operator: 'contains',
        value: [userName]
      });
    }
    if (checkpointName) {
      filterConditions.push({
        field_name: '巡检点名称',
        operator: 'is',
        value: [checkpointName]
      });
    }

    const requestBody = {
      filter: { conjunction: 'and', conditions: filterConditions },
      page_size: 500
    };

    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${CONFIG.BITABLE_APP_TOKEN}/tables/${CONFIG.BITABLE_TABLE_ID}/records/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`查询记录失败：${data.msg}`);
    }

    return data.data.items.map(item => ({
      record_id: item.record_id,
      ...item.fields
    }));
  } catch (error) {
    console.error('查询打卡记录失败:', error);
    return [];
  }
}
