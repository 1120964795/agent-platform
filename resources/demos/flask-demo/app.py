from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/")
def home():
    return jsonify(
        {
            "name": "AionUi Flask Demo",
            "status": "running",
            "hint": "Ask AionUi how this project starts and cite requirements.txt.",
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
