# Demo Script

## Flask Demo

1. Add or open `resources/demos/flask-demo`.
2. Ask: `这个项目怎么启动？`
3. Expected citations: `README.md`, `requirements.txt`, `app.py`.
4. Run `python app.py` before installing dependencies.
5. Expected error: `ModuleNotFoundError`.
6. Run the Flask local start workflow.
7. Confirm `pip install -r requirements.txt`.
8. Confirm `start_service` for `python app.py`.

## Vite Demo

1. Add or open `resources/demos/vite-demo`.
2. Ask: `入口文件在哪？`
3. Expected citations: `package.json`, `src/main.jsx`.
4. Occupy port `5173` or run a second Vite instance.
5. Run the Vite local start workflow.
6. Expected failure branch: `EADDRINUSE`.
7. Confirm insertion of a temporary port-check step.

## Java Demo

1. Add or open `resources/demos/java-demo`.
2. Ask: `这个项目怎么构建？`
3. Expected citations: `pom.xml`, `build.gradle`.
4. Run the Java build check workflow.
5. Expected checks: `java -version`, `javac -version`, `mvn test`.
6. Optional error path: compile/run with an incompatible JDK or run `java com.aionui.demo.App missing` after compilation.
