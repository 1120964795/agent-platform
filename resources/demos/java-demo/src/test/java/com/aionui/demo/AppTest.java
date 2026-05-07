package com.aionui.demo;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AppTest {
    @Test
    void greetingReturnsExpectedText() {
        assertEquals("hello from java-demo", App.greeting());
    }
}
