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

        // 模拟网络请求与模型思考的延迟
        setTimeout(() => {
            try {
                // 模拟一个偶发的网络崩溃异常 (10% 概率)
                if (Math.random() < 0.1) {
                    throw new Error('Network Disconnected');
                }

                const responseText = `[${modelName} 响应]：已收到指令“${message}”。这是一个符合规范的模块化回复。`;
                resolve(responseText);
            } catch (error) {
                // 捕获异常，便于前端提示用户
                reject(error);
            }
        }, 1000);
    });
}