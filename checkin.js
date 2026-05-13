/**
 * 安环巡检打卡 - 前端主逻辑
 * 功能：NFC 读取、GPS 定位、拍照、打卡提交
 */

// API 地址（从环境变量获取，Cloudflare Pages 自动注入）
const API_URL = '';  // 相对路径：API 由 Pages Functions 在同域名下提供

// Vue 应用
const { createApp, ref, reactive, onMounted, computed } = Vue;

createApp({
  setup() {
    // 状态
    const currentTab = ref('home');
    const userInfo = ref(null);
    const checkpoints = ref([]);
    const records = ref([]);
    const filters = reactive({
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    });

    // 今日统计
    const todayStats = computed(() => {
      const today = new Date().toDateString();
      const todayRecords = records.value.filter(r => 
        new Date(r['打卡时间']).toDateString() === today
      );
      const completed = todayRecords.filter(r => r['打卡状态'] === '成功').length;
      const total = checkpoints.value.length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { completed, total, rate };
    });

    // 打卡弹窗
    const showCheckinModal = ref(false);
    const checkinStep = ref(1);
    const nfcUid = ref('');
    const nfcStatus = ref('请将手机靠近 NFC 标签');
    const gps = reactive({ lat: 0, lng: 0, accuracy: 0 });
    const gpsStatus = ref('点击获取 GPS 定位');
    const photoBase64 = ref('');
    const photoPreview = ref('');
    const checkinResult = ref(null);
    const submitting = ref(false);
    const selectedCheckpoint = ref(null);

    // 初始化
    onMounted(async () => {
      await loadUserInfo();
      await loadCheckpoints();
      await loadRecords();
      initChart();
      await registerServiceWorker();
    });

    // 加载用户信息（飞书 JS-SDK）
    async function loadUserInfo() {
      try {
        // 如果在飞书内，使用飞书 SDK 获取用户信息
        if (window.lark) {
          const user = await window.lark.user.get();
          userInfo.value = {
            name: user.name,
            employee_no: user.employee_no,
            open_id: user.open_id
          };
        } else {
          // 模拟用户信息（测试用）
          userInfo.value = {
            name: '测试用户',
            employee_no: '001',
            open_id: 'ou_test'
          };
        }
      } catch (error) {
        console.error('获取用户信息失败:', error);
      }
    }

    // 加载巡检点配置
    async function loadCheckpoints() {
      try {
        const response = await fetch(`${API_URL}/api/checkpoints`);
        const data = await response.json();
        if (data.success) {
          checkpoints.value = data.data.map(cp => ({
            uid: cp.uid,
            name: cp.name,
            lat: cp.lat,
            lng: cp.lng,
            threshold: cp.threshold,
            location: cp.location || '',
            status: 'pending', // pending, completed
            todayCount: 0
          }));
        }
      } catch (error) {
        console.error('加载巡检点失败:', error);
      }
    }

    // 加载打卡记录
    async function loadRecords() {
      try {
        const params = new URLSearchParams({
          startDate: filters.startDate,
          endDate: filters.endDate
        });
        const response = await fetch(`${API_URL}/api/records?${params}`);
        const data = await response.json();
        if (data.success) {
          records.value = data.data;
        }
      } catch (error) {
        console.error('加载记录失败:', error);
      }
    }

    // 初始化图表
    function initChart() {
      const ctx = document.getElementById('completionChart');
      if (!ctx) return;

      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['已完成', '未完成'],
          datasets: [{
            data: [todayStats.value.completed, todayStats.value.total - todayStats.value.completed],
            backgroundColor: ['#10b981', '#e5e7eb']
          }]
        },
        options: {
          responsive: false,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }

    // 开始打卡
    function startCheckin(checkpoint) {
      selectedCheckpoint.value = checkpoint;
      showCheckinModal.value = true;
      checkinStep.value = 1;
      nfcUid.value = '';
      nfcStatus.value = '请将手机靠近 NFC 标签';
      gps.lat = 0;
      gps.lng = 0;
      photoBase64.value = '';
      photoPreview.value = '';
      checkinResult.value = null;
    }

    // 快速打卡
    function quickCheckin() {
      if (checkpoints.value.length > 0) {
        startCheckin(checkpoints.value[0]);
      }
    }

    // 扫描 NFC
    async function scanNFC() {
      // 【诊断】记录设备环境
      console.log('[NFC 诊断] NDEFReader:', 'NDEFReader' in window);
      console.log('[NFC 诊断] window.lark:', !!window.lark);
      console.log('[NFC 诊断] window.lark?.nfc:', !!window.lark?.nfc);
      console.log('[NFC 诊断] window.tt?.nfc:', !!window.tt?.nfc);
      console.log('[NFC 诊断] UserAgent:', navigator.userAgent);
      console.log('[NFC 诊断] Protocol:', location.protocol);

      // 【平台检测】用于提供针对性提示
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isFeishu = /Lark|Feishu|lark/i.test(navigator.userAgent);

      try {
        // 1️⃣ 优先使用飞书 JS Bridge（飞书内置浏览器会注入 window.lark）
        if (window.lark) {
          try {
            // 等待桥接就绪
            await new Promise(resolve => {
              if (window.lark.ready) {
                window.lark.ready(resolve);
              } else {
                resolve(); // 老版本直接使用
              }
            });
            // 尝试多种路径获取 NFC API
            const larkNFC = window.lark.nfc || (window.lark.device && window.lark.device.nfc) || window.tt?.nfc;
            if (larkNFC) {
              const result = await larkNFC.scan({});
              if (result && result.uid) {
                nfcUid.value = formatNFCUid(result.uid);
                nfcStatus.value = '读取成功';
                checkinStep.value = 2;
                return;
              }
            } else {
              console.warn('[NFC 诊断] 飞书环境但无 NFC API 暴露');
            }
          } catch (larkError) {
            console.warn('飞书 NFC 失败，降级到 Web NFC:', larkError);
          }
        }

        // 2️⃣ 降级：Web NFC（仅 Android Chrome + HTTPS）
        if ('NDEFReader' in window) {
          const ndef = new NDEFReader();
          // 先挂载事件再调用 scan，避免时序问题
          ndef.onreadingerror = () => {
            nfcStatus.value = '读取失败，请重试';
          };
          ndef.onreading = event => {
            const uid = event.serialNumber;
            nfcUid.value = uid ? formatNFCUid(uid) : (uid || '');
            nfcStatus.value = '读取成功';
            checkinStep.value = 2;
          };
          await ndef.scan();
        } else {
          // 3️⃣ 完全降级：手动输入（平台针对性提示）
          let msg = '当前环境暂不支持 NFC 读取，请手动输入 UID';
          if (isIOS && isFeishu) {
            msg = '⚠️ iPhone iOS限制飞书网页无法访问NFC，请手动输入 UID';
          } else if (isIOS) {
            msg = '⚠️ iPhone 浏览器不支持 NFC 读取，请手动输入 UID';
          } else if (isFeishu) {
            msg = '⚠️ 飞书环境暂不支持 NFC 读取，请手动输入 UID';
          }
          nfcStatus.value = msg;
          checkinStep.value = 2;
        }
      } catch (error) {
        console.error('NFC 扫描失败:', error);
        nfcStatus.value = '扫描失败：' + error.message + '，请手动输入 UID';
        checkinStep.value = 2;
      }
    }

    // 格式化 NFC UID（带空值保护）
    function formatNFCUid(uid) {
      if (!uid) return '';
      const parts = uid.match(/.{1,2}/g);
      return parts ? parts.join(':').toUpperCase() : uid.toString().toUpperCase();
    }

    // 获取 GPS
    async function getGPS() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          gpsStatus.value = '设备不支持 GPS';
          reject(new Error('GPS 不支持'));
          return;
        }

        gpsStatus.value = '正在定位...';
        
        navigator.geolocation.getCurrentPosition(
          position => {
            gps.lat = position.coords.latitude;
            gps.lng = position.coords.longitude;
            gps.accuracy = position.coords.accuracy;
            gpsStatus.value = `定位成功（精度：${Math.round(position.coords.accuracy)}米）`;
            checkinStep.value = 3;
            resolve();
          },
          error => {
            gpsStatus.value = '定位失败：' + error.message;
            reject(error);
          },
          {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0
          }
        );
      });
    }

    // 拍照
    async function takePhoto() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' } // 后置摄像头
        });
        
        // 创建临时视频元素
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        
        // 创建 canvas 并拍照
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 压缩并转换为 base64
        photoBase64.value = canvas.toDataURL('image/jpeg', 0.8);
        photoPreview.value = photoBase64.value;
        
        // 停止视频流
        stream.getTracks().forEach(track => track.stop());
        
        checkinStep.value = 4;
      } catch (error) {
        console.error('拍照失败:', error);
        alert('拍照失败：' + error.message);
      }
    }

    // 重拍
    function retakePhoto() {
      photoBase64.value = '';
      photoPreview.value = '';
      checkinStep.value = 3;
    }

    // 提交打卡
    async function submitCheckin() {
      if (!nfcUid.value) {
        alert('请先读取或输入 NFC 标签 UID');
        return;
      }
      if (!gps.lat || !gps.lng) {
        alert('请先获取 GPS 定位');
        return;
      }

      submitting.value = true;
      checkinResult.value = null;

      try {
        const response = await fetch(`${API_URL}/api/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nfcUid: nfcUid.value,
            gps: {
              lat: gps.lat,
              lng: gps.lng,
              accuracy: gps.accuracy
            },
            photoBase64: photoBase64.value,
            userInfo: userInfo.value,
            checkpointName: selectedCheckpoint.value?.name
          })
        });

        const result = await response.json();
        checkinResult.value = result;

        if (result.success) {
          // 更新巡检点状态
          if (selectedCheckpoint.value) {
            selectedCheckpoint.value.status = 'completed';
            selectedCheckpoint.value.todayCount = (selectedCheckpoint.value.todayCount || 0) + 1;
          }
          // 刷新记录
          await loadRecords();
        } else {
          // 根据状态码给出针对性提示
          if (response.status === 400) {
            alert('❌ ' + (result.message || '请求参数错误，请检查 NFC 标签是否有效'));
          } else if (response.status === 500) {
            alert('❌ 服务器错误：' + (result.message || '请稍后重试'));
          } else {
            alert('❌ ' + (result.message || '打卡失败，请重试'));
          }
        }
      } catch (error) {
        console.error('打卡提交失败:', error);
        // 区分网络错误和其他错误
        if (error instanceof TypeError && error.message.includes('fetch')) {
          alert('❌ 网络错误：无法连接到服务器，请检查网络连接');
        } else {
          alert('❌ 提交失败：' + error.message);
        }
        checkinResult.value = {
          success: false,
          message: error.message
        };
      } finally {
        submitting.value = false;
      }
    }

    // 关闭弹窗
    function closeCheckinModal() {
      showCheckinModal.value = false;
    }

    // 格式化时间
    function formatTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // 获取文件 URL（飞书云文档）
    function getFileUrl(fileKey) {
      // 需要通过 API 获取临时下载链接
      return `https://open.feishu.cn/open-apis/drive/v1/media/${fileKey}`;
    }

    return {
      currentTab,
      userInfo,
      checkpoints,
      records,
      filters,
      todayStats,
      showCheckinModal,
      checkinStep,
      nfcUid,
      nfcStatus,
      gps,
      gpsStatus,
      photoBase64,
      photoPreview,
      checkinResult,
      submitting,
      selectedCheckpoint,
      startCheckin,
      quickCheckin,
      scanNFC,
      getGPS,
      takePhoto,
      retakePhoto,
      submitCheckin,
      closeCheckinModal,
      loadRecords,
      formatTime,
      getFileUrl
    };
  }
}).mount('#app');
