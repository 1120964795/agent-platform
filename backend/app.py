from flask import Flask, request, jsonify
from backend.service.summarizer import summarize_long_text
from flask_cors import CORS  # 引入 CORS


app = Flask(__name__)
# 启用 CORS 支持
CORS(app)

@app.route("/")
def home():
    return "服务启动成功"


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True)

    # 🔥 关键：兼容不同字段
    message = data.get("message") or data.get("text") or ""

    # 🔥 打印调试信息（非常重要）
    print("🔥 收到前端数据:", data)
    print("🔥 提取 message:", message)

    try:
        result = summarize_long_text(message)
        return jsonify({"output": result})
    except Exception as e:
        return jsonify({"output": f"出错了: {str(e)}"})


if __name__ == "__main__":
    app.run(debug=True)