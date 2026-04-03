// pages/main.js

// 全局状态变量，采用小驼峰命名
let currentActiveModel = DEFAULT_MODEL_NAME;

// 获取 DOM 元素
const modelOptionElements = document.querySelectorAll('.model-option');
const mainInputTextArea = document.getElementById('mainInput');
const sendButton = document.getElementById('sendBtn');
const chatDisplayArea = document.getElementById('chatDisplayArea'); // 假设页面中增加了一个展示区

/**
 * 处理模型切换逻辑
 * @param {HTMLElement} clickedElement 被点击的 DOM 元素
 * @param {string} targetModelName 目标模型的名称
 */
function handleModelSwitch(clickedElement, targetModelName) {
    // 1. 移除所有选项的激活状态
    modelOptionElements.forEach(option => {
        option.classList.remove('active');
    });

    // 2. 激活当前点击的选项
    clickedElement.classList.add('active');

    // 3. 更新全局状态与界面提示
    currentActiveModel = targetModelName;
    mainInputTextArea.placeholder = `${targetModelName}, 发消息、上传文件、打开文件夹或创建定时任务...`;
}

/**
 * 绑定模型切换事件
 * 避免在 HTML 中直接写 onclick，实现逻辑与视图彻底分离
 */
function initModelSwitchEvents() {
    modelOptionElements.forEach(option => {
        option.addEventListener('click', (event) => {
            const modelName = option.getAttribute('data-model-name');
            handleModelSwitch(option, modelName);
        });
    });
}

/**
 * 处理消息发送逻辑
 */
async function handleSendMessage() {
    const userMessage = mainInputTextArea.value.trim();

    if (!userMessage) {
        alert(ERROR_MSG_EMPTY_INPUT);
        return;
    }

    // 更新 UI 状态：清空输入框，禁用发送按钮
    mainInputTextArea.value = '';
    sendButton.disabled = true;

    try {
        // 调用 services 层的 AI 接口逻辑
        const aiResponse = await fetchModelResponse(userMessage, currentActiveModel);
        console.log('AI 返回成功:', aiResponse);
        // 此处未来可扩展 appendMessage(aiResponse) 更新到聊天视图
        alert(aiResponse); // 临时用弹窗展示

    } catch (error) {
        // 调用 AI 接口失败时应有兜底提示
        console.error('AI 调用异常:', error);
        alert(`${ERROR_MSG_NETWORK_FAIL} \n详细信息: ${error.message}`);
    } finally {
        // 恢复按钮状态
        sendButton.disabled = false;
        mainInputTextArea.focus();
    }
}

// 绑定发送按钮事件
sendButton.addEventListener('click', handleSendMessage);

// 页面加载完成时初始化事件
window.addEventListener('DOMContentLoaded', () => {
    initModelSwitchEvents();
});