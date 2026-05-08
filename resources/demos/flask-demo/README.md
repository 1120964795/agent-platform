# Flask Demo

This demo is intentionally tiny so AionUi can index it quickly and demonstrate the V4 Flask flow.

## Start

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

## Expected Diagnostics

- Running `python app.py` before installing dependencies should trigger `ModuleNotFoundError: No module named 'flask'`.
- `requirements.txt` is the source citation for the dependency fix.
- The official Flask workflow template can check Python, install dependencies with confirmation, and launch the service with `start_service`.
