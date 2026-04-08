import re


def split_text(text, max_length=1000):
    """
    将长文本按句子拆分成多个 chunk，每个 chunk 不超过 max_length
    支持中英文标点
    """

    if not text or len(text.strip()) == 0:
        return []

    # ✅ 按中英文句号/问号/感叹号分句
    sentences = re.split(r'(?<=[。！？.!?])', text)

    chunks = []
    current = ""

    for sentence in sentences:
        if not sentence.strip():
            continue

        # 如果当前块加上句子超长
        if len(current) + len(sentence) > max_length:
            if current:
                chunks.append(current.strip())
            current = sentence
        else:
            current += sentence

    # 最后一块
    if current.strip():
        chunks.append(current.strip())

    return chunks