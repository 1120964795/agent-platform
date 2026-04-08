from openai import OpenAI
from backend.utils.splitter import split_text  # ✅ 使用你的分段器

# ==============================
# 👉 直接写死 API Key（简单粗暴，先跑通再说）
# ==============================
API_KEY = "sk-d1dedbdbe4784fa2a42ed283972c8943"

# 👉 初始化客户端
client = OpenAI(
    api_key=API_KEY,
    base_url="https://api.deepseek.com/v1"
)

# ==============================
# 👉 单段总结
# ==============================
def summarize_chunk(chunk):
    try:
        print("🧩 当前处理 chunk:\n", chunk)

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "user",
                    "content": f"请对以下内容进行总结：\n{chunk}"
                }
            ],
            temperature=0.5
        )

        result = response.choices[0].message.content.strip()

        print("✅ chunk总结结果:\n", result)
        return result

    except Exception as e:
        print("❌ chunk总结失败:", str(e))
        return f"[摘要失败] {str(e)}"

# ==============================
# 👉 长文本总结（核心函数）
# ==============================
def summarize_long_text(text):
    print("🔥 原始输入 text =\n", text)

    # ❗防止空输入
    if not text or len(text.strip()) == 0:
        return "请输入需要总结的内容"

    # ✅ 分段
    chunks = split_text(text, max_length=1000)

    print("🔥 分段 chunks =", len(chunks))

    summaries = []

    # 👉 每段总结
    for i, chunk in enumerate(chunks):
        print(f"🚀 正在处理第 {i + 1} 段 / 共 {len(chunks)} 段")
        summary = summarize_chunk(chunk)
        summaries.append(summary)

    # 👉 如果只有一段
    if len(summaries) == 1:
        return summaries[0]

    # ==============================
    # 👉 多段整合总结
    # ==============================
    combined_text = "\n".join(summaries)

    print("🧠 合并后的摘要:\n", combined_text)

    try:
        final_response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个信息整合专家。\n"
                        "请将多段摘要整合为一个结构清晰、逻辑完整的最终总结。\n"
                        "要求：\n"
                        "1. 去除重复信息\n"
                        "2. 合并相似内容\n"
                        "3. 输出条理清晰（可以分点）\n"
                        "4. 保持简洁"
                    )
                },
                {
                    "role": "user",
                    "content": f"请整合以下内容：\n{combined_text}"
                }
            ],
            temperature=0.4
        )

        final_result = final_response.choices[0].message.content.strip()

        print("🎯 最终总结:\n", final_result)
        return final_result

    except Exception as e:
        print("❌ 最终总结失败:", str(e))
        return combined_text + f"\n\n[最终总结失败] {str(e)}"