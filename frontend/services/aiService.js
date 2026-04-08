// services/aiService.js

/**
 * 模拟调用 AI 模型接口服务
 * @param {string} message 用户输入的消息
 * @param {string} modelName 当前选中的模型名称
 * @returns {Promise<string>} 返回模型处理后的文本
 */
async function fetchModelResponse(message, modelName) {
    return new Promise((resolve, reject) => {
        // 模型调用必须进行异常处理，拦截空消息
        if (!message || message.trim() === '') {
            reject(new Error(ERROR_MSG_EMPTY_INPUT));
            return;
        }

        // 发送请求到后端 API
        fetch('http://127.0.0.1:5000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message })
        })
            .then(response => {
                // 检查响应状态
                if (!response.ok) {
                    throw new Error(`API 请求失败，状态码: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // 模型返回数据，解析并返回
                if (data.output) {
                    resolve(`[${modelName} 响应]：${data.output}`);
                } else {
                    reject(new Error("模型没有返回有效的总结"));
                }
            })
            .catch(error => {
                // 捕获网络请求错误或者 API 错误
                reject(new Error(`请求失败: ${error.message}`));
            });
    });
}
