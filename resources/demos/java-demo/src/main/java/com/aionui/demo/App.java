package com.aionui.demo;

public class App {
    public static void main(String[] args) throws ClassNotFoundException {
        if (args.length > 0 && "missing".equals(args[0])) {
            Class.forName("com.aionui.demo.DoesNotExist");
        }
        System.out.println("AionUi Java Demo is ready.");
    }

    public static String greeting() {
        return "hello from java-demo";
    }
}
