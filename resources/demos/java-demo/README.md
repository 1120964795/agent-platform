# Java Demo

This demo gives AionUi a stable Java project for build diagnostics.

## Start

```powershell
java -version
javac -version
mvn test
```

Gradle metadata is included for indexing, but Maven is the primary demo path.

## Expected Diagnostics

- `pom.xml` identifies the Java release target and JUnit test dependency.
- Running with an old JDK can produce `UnsupportedClassVersionError`.
- Running `java com.aionui.demo.App missing` after compilation demonstrates `ClassNotFoundException`.
