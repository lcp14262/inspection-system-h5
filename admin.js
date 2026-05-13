/**
 * 管理后台逻辑
 */

const API_URL = '';  // 相对路径：API 由 Pages Functions 在同域名下提供

const { createApp, ref, reactive, onMounted, computed } = Vue;

createApp({
  setup() {
    // 登录状态
    const isLoggedIn = ref(false);
    const userInfo = ref(null);
    const adminTab = ref('checkpoints');

    // 数据
    const checkpoints = ref([]);
    const records = ref([]);
    const filters = reactive({
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      userName: '',
      checkpointName: ''
    });

    // 统计
    const stats = ref({
      todayCheckins: 0,
      todayRate: 0,
      monthCheckins: 0,
      abnormalCheckins: 0
    });

    // 弹窗
    const showAddCheckpoint = ref(false);
    const showEditCheckpoint = ref(false);
    const checkpointForm = reactive({
      name: '',
      uid: '',
      lat: 0,
      lng: 0,
      threshold: 100,
      enabled: true
    });

    // 初始化
    onMounted(() => {
      // 检查登录状态
      const savedUser = localStorage.getItem('admin_user');
      if (savedUser) {
        userInfo.value = JSON.parse(savedUser);
        isLoggedIn.value = true;
        loadData();
      }
    });

    // 加载数据
    async function loadData() {
      await loadCheckpoints();
      await loadRecords();
      await loadStats();
    }

    // 登录
    function loginWithLark() {
      // 实际项目中应该调用飞书 OAuth
      // 这里简化处理
      userInfo.value = {
        name: '管理员',
        employee_no: 'admin'
      };
      isLoggedIn.value = true;
      localStorage.setItem('admin_user', JSON.stringify(userInfo.value));
      loadData();
    }

    // 登出
    function logout() {
      localStorage.removeItem('admin_user');
      isLoggedIn.value = false;
      userInfo.value = null;
    }

    // 加载巡检点
    async function loadCheckpoints() {
      try {
        const response = await fetch(`${API_URL}/api/checkpoints`);
        const data = await response.json();
        if (data.success) {
          checkpoints.value = data.data;
        }
      } catch (error) {
        console.error('加载巡检点失败:', error);
      }
    }

    // 加载记录
    async function loadRecords() {
      try {
        const params = new URLSearchParams({
          startDate: filters.startDate,
          endDate: filters.endDate,
          userName: filters.userName,
          checkpointName: filters.checkpointName
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

    // 加载统计
    async function loadStats() {
      // 简化处理，实际应该调用统计 API
      const today = new Date().toDateString();
      const todayRecords = records.value.filter(r => 
        new Date(r['打卡时间']).toDateString() === today
      );
      
      stats.value.todayCheckins = todayRecords.length;
      stats.value.todayRate = checkpoints.value.length > 0 
        ? Math.round((todayRecords.length / checkpoints.value.length) * 100) 
        : 0;
      
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const monthRecords = records.value.filter(r => 
        new Date(r['打卡时间']) >= monthStart
      );
      stats.value.monthCheckins = monthRecords.length;
      stats.value.abnormalCheckins = records.value.filter(r => 
        r['打卡状态'] === '异常'
      ).length;

      // 初始化图表
      setTimeout(() => {
        initCharts();
      }, 100);
    }

    // 保存巡检点
    async function saveCheckpoint() {
      try {
        // 实际应该调用 API 保存
        if (showEditCheckpoint.value) {
          // 更新
          const index = checkpoints.value.findIndex(cp => cp.uid === checkpointForm.uid);
          if (index !== -1) {
            checkpoints.value[index] = { ...checkpointForm };
          }
        } else {
          // 新增
          checkpoints.value.push({ ...checkpointForm });
        }
        closeModal();
        alert('保存成功');
      } catch (error) {
        alert('保存失败：' + error.message);
      }
    }

    // 编辑巡检点
    function editCheckpoint(cp) {
      checkpointForm.name = cp.name;
      checkpointForm.uid = cp.uid;
      checkpointForm.lat = cp.lat;
      checkpointForm.lng = cp.lng;
      checkpointForm.threshold = cp.threshold;
      checkpointForm.enabled = cp.enabled;
      showEditCheckpoint.value = true;
    }

    // 删除巡检点
    function deleteCheckpoint(cp) {
      if (confirm(`确定要删除巡检点 "${cp.name}" 吗？`)) {
        checkpoints.value = checkpoints.value.filter(c => c.uid !== cp.uid);
      }
    }

    // 扫描 NFC
    async function scanNFC() {
      // 【诊断】记录设备环境
      console.log('[NFC 诊断] NDEFReader:', 'NDEFReader' in window);
      console.log('[NFC 诊断] window.lark?.nfc:', !!window.lark?.nfc);
      console.log('[NFC 诊断] window.tt?.nfc:', !!window.tt?.nfc);
      console.log('[NFC 诊断] UserAgent:', navigator.userAgent);
      console.log('[NFC 诊断] Protocol:', location.protocol);

      try {
        // 1️⃣ 优先使用飞书 SDK（飞书 App 内置浏览器，iOS/Android 均支持）
        const larkAPI = window.lark?.nfc || window.tt?.nfc;
        if (larkAPI) {
          try {
            const result = await larkAPI.scan({});
            if (result && result.uid) {
              checkpointForm.uid = formatNFCUid(result.uid);
              return;
            }
          } catch (larkError) {
            console.warn('飞书 NFC 失败，降级到 Web NFC:', larkError);
          }
        }

        // 2️⃣ 降级：Web NFC（仅 Android Chrome + HTTPS）
        if ('NDEFReader' in window) {
          const ndef = new NDEFReader();
          await ndef.scan();

          ndef.onreadingerror = () => {
            alert('NFC 标签读取失败，请重试或手动输入 UID');
          };

          ndef.onreading = event => {
            const uid = event.serialNumber;
            if (uid) {
              checkpointForm.uid = formatNFCUid(uid);
            } else {
              alert('未能读取到 NFC 标签序列号（Web NFC 限制），请手动输入 UID');
            }
          };
        } else {
          // 3️⃣ 完全降级：手动输入
          alert('设备不支持 NFC 读取，请手动输入 UID');
        }
      } catch (error) {
        console.error('NFC 扫描失败:', error);
        alert('扫描失败：' + error.message + '，请手动输入 UID');
      }
    }

    // 格式化 NFC UID（带空值保护）
    function formatNFCUid(uid) {
      if (!uid) return '';
      const parts = uid.match(/.{1,2}/g);
      return parts ? parts.join(':').toUpperCase() : uid.toString().toUpperCase();
    }

    // 关闭弹窗
    function closeModal() {
      showAddCheckpoint.value = false;
      showEditCheckpoint.value = false;
    }

    // 导出 Excel
    function exportCheckpoints() {
      // 简化处理，实际应该生成 Excel 文件
      const csv = checkpoints.value.map(cp => 
        `${cp.name},${cp.uid},${cp.lat},${cp.lng},${cp.threshold},${cp.enabled ? '启用' : '禁用'}`
      ).join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = '巡检点配置.csv';
      link.click();
    }

    // 导出记录
    function exportRecords() {
      const csv = records.value.map(r => 
        `${r['打卡时间']},${r['用户姓名']},${r['巡检点名称']},${r['NFC 标签 UID']},${r['GPS 坐标']},${r['GPS 校验结果']},${r['打卡状态']}`
      ).join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = '打卡记录.csv';
      link.click();
    }

    // 格式化时间
    function formatDateTime(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN');
    }

    // 初始化图表
    function initCharts() {
      const trendCtx = document.getElementById('trendChart');
      const checkpointCtx = document.getElementById('checkpointChart');
      
      if (trendCtx) {
        new Chart(trendCtx, {
          type: 'line',
          data: {
            labels: ['7 天前', '6 天前', '5 天前', '4 天前', '3 天前', '2 天前', '昨天'],
            datasets: [{
              label: '打卡次数',
              data: [10, 15, 12, 18, 20, 16, 14],
              borderColor: '#1e40af',
              tension: 0.3
            }]
          }
        });
      }
      
      if (checkpointCtx) {
        new Chart(checkpointCtx, {
          type: 'bar',
          data: {
            labels: checkpoints.value.map(cp => cp.name),
            datasets: [{
              label: '打卡次数',
              data: checkpoints.value.map(() => Math.floor(Math.random() * 20)),
              backgroundColor: '#1e40af'
            }]
          }
        });
      }
    }

    return {
      isLoggedIn,
      userInfo,
      adminTab,
      checkpoints,
      records,
      filters,
      stats,
      showAddCheckpoint,
      showEditCheckpoint,
      checkpointForm,
      loginWithLark,
      logout,
      loadRecords,
      saveCheckpoint,
      editCheckpoint,
      deleteCheckpoint,
      scanNFC,
      closeModal,
      exportCheckpoints,
      exportRecords,
      formatDateTime
    };
  }
}).mount('#app');
