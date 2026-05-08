// pages/main.js

// 全局状态变量，采用小驼峰命名
let currentActiveModel = DEFAULT_MODEL_NAME;
let currentMode = "chat"; // chat | ppt
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
        let finalMessage = userMessage;

// 如果是 PPT 模式，就改 prompt
        if (currentMode === "ppt") {
            finalMessage = `
你是一个PPT生成助手，请严格按照以下格式输出：

第1页：标题
- 要点1
- 要点2
- 要点3

第2页：标题
- 要点1
- 要点2
- 要点3

要求：
1. 必须使用“第X页：”格式
2. 每页3-5个要点（必须用“- ”开头）
3. 不要写解释，不要写多余内容
4. 不要使用Markdown符号（如###、---）

用户主题：
${userMessage}
`;
        }

        // 显示用户消息
        appendMessage(userMessage, "user");

        // 调用 AI
        const aiResponse = await fetchModelResponse(finalMessage, currentActiveModel);
        console.log('AI 返回成功:', aiResponse);

        // 显示 AI 回复
        if (currentMode === "ppt") {
            const slides = parsePPTContent(aiResponse);
            renderPPTSlides(slides);
            // ⭐ 自动生成桌面 PPT
            exportToDesktopPPT(slides);
        } else {
            appendMessage(aiResponse, "ai");
        }

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
    // ⭐ 绑定 PPT按钮
    const skillButtons = document.querySelectorAll('.skill-pill');

    skillButtons.forEach(btn => {
        if (btn.innerText.includes("PPT")) {
            btn.addEventListener('click', () => {
                switchToPPTMode();
                console.log("已切换到 PPT 模式");
            });
        }
    });
});
function switchToPPTMode() {
    currentMode = "ppt";
    mainInputTextArea.placeholder = "请输入PPT主题，例如：人工智能发展";
}

function switchToChatMode() {
    currentMode = "chat";
    mainInputTextArea.placeholder = "请输入内容开始聊天...";
}
function appendMessage(content, role = "ai") {
    const msgDiv = document.createElement("div");

    msgDiv.style.padding = "10px";
    msgDiv.style.margin = "10px";
    msgDiv.style.borderRadius = "8px";
    msgDiv.style.maxWidth = "80%";

    if (role === "user") {
        msgDiv.style.backgroundColor = "#dbeafe";
        msgDiv.style.alignSelf = "flex-end";
    } else {
        msgDiv.style.backgroundColor = "#f3f4f6";
        msgDiv.style.alignSelf = "flex-start";
    }

    // 支持换行
    msgDiv.innerHTML = content.replace(/\n/g, "<br>");

    chatDisplayArea.appendChild(msgDiv);
}
function parsePPTContent(text) {
    const slides = [];
    const parts = text.split(/第\d+页：/).filter(Boolean);

    parts.forEach((part, index) => {
        const lines = part.trim().split("\n").filter(Boolean);
        const title = lines[0];
        const points = lines.slice(1);

        slides.push({
            title: `第${index + 1}页：${title}`,
            points: points
        });
    });

    return slides;
}
function renderPPTSlides(slides) {
    chatDisplayArea.innerHTML = ""; // 清空

    slides.forEach(slide => {
        const card = document.createElement("div");

        card.style.border = "1px solid #ddd";
        card.style.borderRadius = "12px";
        card.style.padding = "20px";
        card.style.margin = "15px auto";
        card.style.width = "60%";
        card.style.background = "#fff";
        card.style.boxShadow = "0 4px 10px rgba(0,0,0,0.1)";

        const title = document.createElement("h3");
        title.innerText = slide.title;

        const list = document.createElement("ul");

        slide.points.forEach(point => {
            const li = document.createElement("li");
            li.innerText = point.replace(/^- /, "");
            list.appendChild(li);
        });

        card.appendChild(title);
        card.appendChild(list);
        chatDisplayArea.appendChild(card);
    });
}
async function exportToDesktopPPT(slides) {
    if (!slides || slides.length === 0) {
        alert("没有PPT内容");
        return;
    }

    try {
        const response = await fetch("http://localhost:3000/generate-ppt", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                slides: slides
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("后端报错：", errText);
            alert("生成失败（后端报错）");
            return;
        }

        const data = await response.json();
        console.log("PPT生成成功：", data.path);
        alert("PPT 已生成！");
    } catch (err) {
        console.error(err);
        alert("生成失败，请检查后端");
    }
}